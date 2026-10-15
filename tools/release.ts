/**
 * Release: check everything, then ship dev to main through a pull request, and wait for the deploy.
 * main is protected: nothing reaches it except a pull request whose "Check" job passed.
 *
 * 1. You must be on dev with nothing uncommitted, with the GitHub CLI (gh) installed.
 * 2. Runs the same checks as CI (formatting, lint, types, tests, build); stops if one fails.
 * 3. Pushes dev, and opens a pull request from dev to main (or uses the one already open).
 * 4. Waits for its checks, then merges it.
 * 5. GitHub Actions builds main and publishes dist/ to the gh-pages branch, which GitHub Pages
 *    serves. This waits for that run and reports.
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

if (await capture("gh", "--version") === null) fail("Install the GitHub CLI (gh): main only takes pull requests.");

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

const version = JSON.parse(await Deno.readTextFile(new URL("../deno.json", import.meta.url))).version;

console.log("\n→ Pushing dev…");
if (!await run("git", ["push", "origin", "dev"])) fail("Couldn't push dev.");

/** The open pull request from dev to main, if there is one. */
const openPr = () =>
  capture(
    "gh",
    "pr",
    "list",
    "--base",
    "main",
    "--head",
    "dev",
    "--state",
    "open",
    "--json",
    "number",
    "-q",
    ".[0].number",
  );
let pr = await openPr();
if (!pr) {
  console.log("→ Opening a pull request from dev to main…");
  const body = "Ships dev to main. See CHANGELOG.md for what's in it.";
  if (
    !await run("gh", [
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      "dev",
      "--title",
      `Release v${version}`,
      "--body",
      body,
    ])
  ) {
    fail("Couldn't open the pull request.");
  }
  pr = await openPr();
}
if (!pr) fail("Couldn't find the pull request from dev to main.");

console.log(`→ Waiting for the checks on #${pr}…`);
// Give GitHub a moment to start the checks for the push just made.
await new Promise((r) => setTimeout(r, 10_000));
if (!await run("gh", ["pr", "checks", pr, "--watch", "--fail-fast"])) {
  fail(`The checks failed on #${pr}, so nothing was merged.`);
}
if (!await run("gh", ["pr", "merge", pr, "--merge"])) fail(`Couldn't merge #${pr}.`);
await run("git", ["fetch", "origin", "main"]);

const sha = await capture("gh", "pr", "view", pr, "--json", "mergeCommit", "-q", ".mergeCommit.oid");
if (!sha) fail(`#${pr} merged, but its merge commit wasn't found. Check the Actions tab on GitHub.`);
console.log(`\n✓ Merged #${pr}: v${version} is on main (${sha.slice(0, 7)}).`);

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
