/**
 * Builds the site into dist/: copies public/ and bundles the TypeScript with esbuild.
 *
 *   npm run build     build once
 *   npm run dev       build, rebuild on changes, and serve at http://localhost:8010/
 *
 * src/main.ts becomes dist/app.js and src/bots/worker.ts becomes dist/worker.js.
 */
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");

const version: string = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;

/**
 * A short hash of everything the site is built from (src/, public/ and the version). The page
 * asks for app.js, style.css and worker.js with it (`app.js?v=…`), so a browser holding an old
 * copy of one file (GitHub Pages lets them keep files for 10 minutes) can never pair a new page
 * with an old script: any change gives new URLs, and an old page still finds its own files.
 */
async function buildStamp(): Promise<string> {
  const parts: string[] = [version];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path);
      // Paths with forward slashes, so the stamp is the same on every system.
      else parts.push(relative(ROOT, path).split(sep).join("/"), await readFile(path, "utf8"));
    }
  };
  await walk(join(ROOT, "src"));
  await walk(join(ROOT, "public"));
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 8);
}

export async function build(): Promise<void> {
  const started = performance.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(join(ROOT, "public"), DIST, { recursive: true });
  // The version from package.json goes into the page itself, so the footer shows it before any
  // script runs; the build stamp goes on the page's script and stylesheet (see buildStamp).
  const stamp = await buildStamp();
  const page = join(DIST, "index.html");
  await writeFile(
    page,
    (await readFile(page, "utf8")).replace(/\{\{\s*version\s*\}\}/g, version).replace(/\{\{\s*build\s*\}\}/g, stamp),
  );
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: { app: "src/main.ts", worker: "src/bots/worker.ts" },
    outdir: DIST,
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    sourcemap: "linked",
    define: { __VERSION__: JSON.stringify(version), __BUILD__: JSON.stringify(stamp) },
    logLevel: "warning",
    metafile: true,
  });
  const kb = Object.entries(result.metafile.outputs)
    .filter(([path]) => path.endsWith(".js"))
    .map(([path, out]) => `${path.split("/").pop()} ${(out.bytes / 1024).toFixed(1)} kB`).join(", ");
  console.log(`Built dist/ v${version}, build ${stamp} (${kb}) in ${Math.round(performance.now() - started)} ms`);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".map": "application/json",
};

/** Serves dist/ for development: files as they are, / as index.html, nothing outside dist/. */
function serve(port: number): void {
  createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const file = resolve(DIST, "." + (path.endsWith("/") ? path + "index.html" : path));
    if (!file.startsWith(DIST)) return void res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }).listen(port, () => console.log(`Serving http://localhost:${port}/`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  await build();
  if (args.has("--serve")) serve(8010);
  if (args.has("--watch")) {
    console.log("Watching src/ and public/…");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rebuild = () => {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch((e) => console.error(`Build failed: ${e.message}`)), 120);
    };
    for (const dir of ["src", "public"]) watch(join(ROOT, dir), { recursive: true }, rebuild);
  }
}
