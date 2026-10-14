/**
 * Release: check everything, merge dev into main, push both, and wait for the deploy.
 *
 * 1. You must be on dev with nothing uncommitted.
 * 2. Runs the same checks as CI (formatting, lint, types, tests, build); stops if one fails.
 * 3. Pushes dev, fast-forwards main to dev, pushes main, and goes back to dev.
 * 4. GitHub Actions builds main and publishes dist/ to the gh-pages branch, which GitHub Pages
 *    serves. If the GitHub CLI (gh) is installed, this waits for that run and reports.
 *
 * Run: deno task release
 */
const SITE = "https://seven-leven.github.io/mancala/";

async function run(cmd: string, args: string[]): Promise<boolean> {
  try {
    const { success } = await new Deno.Command(cmd, { args, stdout: "inherit", stderr: "inherit" }).output();
    return success;
  } catch {
    return false;
  }
}

async function capture(cmd: string, ...args: string[]): Promise<string | null> {
  try {
    const out = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "null" }).output();
    return out.success ? new TextDecoder().decode(out.stdout).trim() : null;
  } catch {
    return null;
  }
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  Deno.exit(1);
}

const branch = await capture("git", "rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "dev") fail(`Release from dev (you're on ${branch ?? "?"}).`);
if (await capture("git", "status", "--porcelain")) fail("Commit or stash your changes first.");

const checks: [string, string[]][] = [
  ["Formatting", ["fmt", "--check"]],
  ["Lint", ["lint"]],
  ["Types", ["task", "check"]],
  ["Tests", ["task", "test"]],
  ["Build", ["task", "build"]],
];
for (const [name, args] of checks) {
  console.log(`→ ${name}…`);
  if (!await run("deno", args)) fail(`${name} failed, so nothing was pushed.`);
}

console.log("\n→ Pushing dev and fast-forwarding main…");
const ok = await run("git", ["push", "origin", "dev"]) &&
  await run("git", ["checkout", "main"]) &&
  await run("git", ["merge", "--ff-only", "dev"]) &&
  await run("git", ["push", "origin", "main"]);
await run("git", ["checkout", "dev"]);
if (!ok) fail("Couldn't update main (does it have commits that aren't on dev?).");

const sha = (await capture("git", "rev-parse", "HEAD"))!;
const version = JSON.parse(await Deno.readTextFile(new URL("../deno.json", import.meta.url))).version;
console.log(`\n✓ Pushed v${version} (${sha.slice(0, 7)}).`);

if (await capture("gh", "--version") === null) {
  console.log(`Install the GitHub CLI (gh) to wait for the deploy here. Otherwise it'll be live at ${SITE} shortly.`);
  Deno.exit(0);
}
console.log("→ Waiting for the deploy run…");
let runId: string | null = null;
for (let i = 0; i < 24 && !runId; i++) {
  runId = await capture(
    "gh",
    "run",
    "list",
    "--branch",
    "main",
    "--commit",
    sha,
    "--limit",
    "1",
    "--json",
    "databaseId",
    "-q",
    ".[0].databaseId",
  ) || null;
  if (!runId) await new Promise((r) => setTimeout(r, 5000));
}
if (!runId) fail("The deploy run didn't start. Check the Actions tab on GitHub.");
if (!await run("gh", ["run", "watch", runId, "--exit-status"])) {
  fail(`The deploy run failed: gh run view ${runId} --log-failed`);
}
console.log(`\n✓ Deployed v${version}. GitHub Pages usually updates within a minute: ${SITE}`);
