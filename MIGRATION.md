# Migrating from Deno to Node

A working plan, deleted once the move is done and checked. Target: **Node 24** (installed: 24.18, npm 11.16), running
the TypeScript as it is, with Node's own type stripping: no compile step, no `tsx`, no `ts-node`.

## Principles

- **Same behaviour.** Every test passes as before (72), and the rating harness repeats game for game: its snapshot test
  and a before/after tournament must match exactly.
- **Node's own tools first.** `node:test`, `node:assert`, `node:fs`, `node:http`, `node:worker_threads`,
  `node:child_process`; npm packages only for what Node lacks (esbuild, TypeScript, formatting, linting, Puppeteer).
- **The browser code doesn't change**, except where TypeScript syntax can't be stripped.

## What changes

| Deno                                                                     | Node                                                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `deno.json` (version, imports, tasks)                                    | `package.json` (version, devDependencies, scripts) and `tsconfig.json`                                                 |
| `deno.lock`                                                              | `package-lock.json`                                                                                                    |
| `deno task X`                                                            | `npm run X` (arguments after `--`: `npm run rate -- 240 --write`)                                                      |
| Running `.ts` directly                                                   | Node 24's type stripping (`node tools/build.ts`)                                                                       |
| `deno check`                                                             | `tsc --noEmit`, with `erasableSyntaxOnly` and `verbatimModuleSyntax` so tsc rejects what Node can't run                |
| `deno fmt`                                                               | dprint: the formatter `deno fmt` is built on, so the code's style stays the same                                       |
| `deno lint`                                                              | ESLint with typescript-eslint's recommended rules                                                                      |
| `deno test`, `@std/assert`                                               | `node --test`; a small `tests/assert.ts` with the same `assert`, `assertEquals` and `assertThrows`, over `node:assert` |
| `deno coverage`                                                          | `node --test --experimental-test-coverage`                                                                             |
| `@std/path`                                                              | `node:path`, `node:url`                                                                                                |
| `@std/http` file server, `Deno.serve`                                    | a small static server on `node:http`                                                                                   |
| esbuild as WebAssembly from deno.land                                    | the `esbuild` npm package                                                                                              |
| `puppeteer-core` from `npm:`                                             | the same package from npm                                                                                              |
| Web Workers in the rating harness                                        | `node:worker_threads` (`tools/tournament/pool.ts`, `worker.ts`)                                                        |
| `Deno.args`, `env`, `exit`, signals, stderr, files, `Command`, `watchFs` | `process.*`, `node:fs`, `node:child_process`, `fs.watch`                                                               |
| `localStorage` in tests                                                  | an in-memory stand-in installed by `storage_test.ts` when there's none                                                 |
| `--allow-*` permissions                                                  | gone (Node has no permission flags by default)                                                                         |
| CI: `denoland/setup-deno`, caches                                        | `actions/setup-node` with npm's cache, `npm ci`                                                                        |

Syntax Node can't strip: 9 constructor parameter properties (`constructor(private rng: Rng)`) in `src/app/game.ts` and
`src/bots/players/*.ts` become plain fields. No enums or namespaces. `import.meta.main` in `tools/build.ts` becomes a
check against `process.argv[1]`.

## Steps

1. `package.json`, `tsconfig.json`, `dprint.json`, `eslint.config.js`; `npm install`; `node_modules/` in `.gitignore`.
2. Make the code strippable: parameter properties out; `tsc` clean with the strict options.
3. Tests: `tests/assert.ts`, `node:test`, `node:fs`, the `localStorage` stand-in; `harness_test.ts` on the new pool.
4. Tools: `build.ts` (npm esbuild, `node:http` dev server, `fs.watch`), the tournament and its pool and worker,
   `release.ts`, `bench.ts`, `ladder.ts`, `positions.ts`, the two sheet tools.
5. CI workflow; docs (`deno task` → `npm run`, README's "How it's built", TESTING.md, RATING.md, BOTS.md, TODO.md's
   decisions).
6. Remove `deno.json` and `deno.lock`.

## Done when

- `npm test` passes all 72 tests; `npm run check`, `npm run lint` and `npm run fmt:check` are clean; `npm run build`
  builds the site and `npm run dev` serves it, with the game and its bot worker playing in the browser.
- `npm run rate -- 4 --bots random,greedy,generous,hoarder,striker` prints exactly what `deno task rate` printed before
  the move; `--resume` and `--workers` still give the same tables.
- The tools run: `bench`, `ladder`, `positions`, `profile`, `icon-sheet`, `coverage`.
- No `Deno.` and no `deno` command left anywhere in the repo, except the CHANGELOG's history.
- CI passes on GitHub with the new workflow.
