/**
 * Every relative link and #anchor in the Markdown docs resolves: to a file that exists, and to a
 * heading that exists (as GitHub makes anchors from headings). So a renamed heading or a moved
 * file can't leave a dead link behind.
 */
import { test } from "node:test";
import { assertEquals } from "./assert.ts";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set([".git", ".cache", "dist", "data", "node_modules", "coverage"]);

async function markdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...await markdownFiles(path));
    else if (e.name.endsWith(".md")) out.push(path);
  }
  return out;
}

/** GitHub's anchors: lower case, punctuation dropped, spaces to hyphens; repeats get -1, -2… */
function anchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  const body = markdown.replace(/```[\s\S]*?```/g, "");
  for (const [, text] of body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "");
    const slug = plain.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    out.add(n ? `${slug}-${n}` : slug);
  }
  return out;
}

test("every relative link and #anchor in the docs resolves", async () => {
  const files = await markdownFiles(ROOT);
  const texts = new Map(await Promise.all(files.map(async (f) => [f, await readFile(f, "utf8")] as const)));
  const broken: string[] = [];
  for (const [file, text] of texts) {
    const body = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const [, target] of body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue; // https:, mailto:
      const [path, hash] = target.split("#");
      const resolved = path ? join(dirname(file), decodeURIComponent(path)) : file;
      const where = `${relative(ROOT, file)}: ${target}`;
      try {
        await stat(resolved);
      } catch {
        broken.push(`${where} (no such file)`);
        continue;
      }
      if (hash && resolved.endsWith(".md")) {
        const heads = anchors(texts.get(resolved) ?? await readFile(resolved, "utf8"));
        if (!heads.has(hash.toLowerCase())) broken.push(`${where} (no heading #${hash})`);
      }
    }
  }
  assertEquals(broken, [], `dead links:\n${broken.join("\n")}`);
});
