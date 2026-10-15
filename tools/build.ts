/**
 * Builds the site into dist/: copies public/ and bundles the TypeScript with esbuild.
 *
 *   deno task build     build once
 *   deno task dev       build, rebuild on changes, and serve at http://localhost:8010/
 *
 * src/main.ts becomes dist/app.js and src/bots/worker.ts becomes dist/worker.js. esbuild runs
 * as WebAssembly (fetched once from jsDelivr into .cache/), so the build needs nothing from npm.
 */
import * as esbuild from "esbuild";
import { serveDir } from "@std/http/file-server";
import { fromFileUrl, join, relative, SEPARATOR } from "@std/path";

const ROOT = fromFileUrl(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const ESBUILD = "0.25.5";
const WASM_URL = `https://cdn.jsdelivr.net/npm/esbuild-wasm@${ESBUILD}/esbuild.wasm`;
const WASM_CACHE = join(ROOT, ".cache", `esbuild-${ESBUILD}.wasm`);

const version: string = JSON.parse(await Deno.readTextFile(join(ROOT, "deno.json"))).version;

/**
 * A short hash of everything the site is built from (src/, public/ and the version). The page
 * asks for app.js, style.css and worker.js with it (`app.js?v=…`), so a browser holding an old
 * copy of one file (GitHub Pages lets them keep files for 10 minutes) can never pair a new page
 * with an old script: any change gives new URLs, and an old page still finds its own files.
 */
async function buildStamp(): Promise<string> {
  const parts: string[] = [version];
  const walk = async (dir: string) => {
    const entries = [];
    for await (const e of Deno.readDir(dir)) entries.push(e);
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, e.name);
      if (e.isDirectory) await walk(path);
      else parts.push(relative(ROOT, path), await Deno.readTextFile(path));
    }
  };
  await walk(join(ROOT, "src"));
  await walk(join(ROOT, "public"));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\0")));
  return [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function esbuildWasm(): Promise<WebAssembly.Module> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await Deno.readFile(WASM_CACHE);
  } catch {
    const res = await fetch(WASM_URL);
    if (!res.ok) throw new Error(`Couldn't download esbuild (${res.status} from ${WASM_URL})`);
    bytes = new Uint8Array(await res.arrayBuffer());
    await Deno.mkdir(join(ROOT, ".cache"), { recursive: true });
    await Deno.writeFile(WASM_CACHE, bytes);
  }
  return await WebAssembly.compile(bytes);
}
await esbuild.initialize({ wasmModule: await esbuildWasm(), worker: false });

/** esbuild-wasm can't read files itself, so this plugin resolves and loads the sources. */
const sources: esbuild.Plugin = {
  name: "sources",
  setup(build) {
    // Paths inside the build are posix paths from the repo root ("/src/main.ts").
    const toBuildPath = (abs: string) => "/" + relative(ROOT, abs).split(SEPARATOR).join("/");
    const toDisk = (p: string) => join(ROOT, ...p.split("/"));
    build.onResolve({ filter: /.*/ }, ({ path, importer }) => {
      const base = importer ? join(toDisk(importer), "..") : ROOT;
      return { path: toBuildPath(join(base, path)), namespace: "src" };
    });
    build.onLoad({ filter: /.*/, namespace: "src" }, async ({ path }) => ({
      contents: await Deno.readTextFile(toDisk(path)),
      loader: "ts",
    }));
  },
};

async function copyDir(from: string, to: string): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  for await (const entry of Deno.readDir(from)) {
    const [src, dest] = [join(from, entry.name), join(to, entry.name)];
    if (entry.isDirectory) await copyDir(src, dest);
    else await Deno.copyFile(src, dest);
  }
}

export async function build(): Promise<void> {
  const started = performance.now();
  await Deno.remove(DIST, { recursive: true }).catch(() => {});
  await copyDir(join(ROOT, "public"), DIST);
  // The version from deno.json goes into the page itself, so the footer shows it before any script
  // runs; the build stamp goes on the page's script and stylesheet (see buildStamp).
  const stamp = await buildStamp();
  const page = join(DIST, "index.html");
  await Deno.writeTextFile(
    page,
    (await Deno.readTextFile(page)).replace(/\{\{\s*version\s*\}\}/g, version).replace(/\{\{\s*build\s*\}\}/g, stamp),
  );
  const result = await esbuild.build({
    plugins: [sources],
    entryPoints: { app: "src/main.ts", worker: "src/bots/worker.ts" },
    outdir: "dist",
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    sourcemap: "linked",
    write: false,
    define: { __VERSION__: JSON.stringify(version), __BUILD__: JSON.stringify(stamp) },
    logLevel: "warning",
  });
  for (const file of result.outputFiles) {
    const name = file.path.split(/[\\/]/).pop()!;
    await Deno.writeFile(join(DIST, name), file.contents);
  }
  const kb = result.outputFiles.filter((f) => f.path.endsWith(".js"))
    .map((f) => `${f.path.split(/[\\/]/).pop()} ${(f.contents.length / 1024).toFixed(1)} kB`).join(", ");
  console.log(`Built dist/ v${version}, build ${stamp} (${kb}) in ${Math.round(performance.now() - started)} ms`);
}

if (import.meta.main) {
  const args = new Set(Deno.args);
  await build();
  if (args.has("--serve")) {
    Deno.serve(
      { port: 8010, onListen: () => console.log("Serving http://localhost:8010/") },
      (req) => serveDir(req, { fsRoot: DIST, quiet: true }),
    );
  }
  if (args.has("--watch")) {
    console.log("Watching src/ and public/…");
    let timer: ReturnType<typeof setTimeout> | undefined;
    for await (const _ of Deno.watchFs([join(ROOT, "src"), join(ROOT, "public")])) {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch((e) => console.error(`Build failed: ${e.message}`)), 120);
    }
  } else if (!args.has("--serve")) {
    esbuild.stop();
  }
}
