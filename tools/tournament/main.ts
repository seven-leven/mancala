/**
 * Every bot plays every other bot; prints Elo ratings and a win-rate table (as in the README).
 *
 *   deno task tournament [games per pairing, default 40] [--openings random-moves|symmetric|standard]
 *                        [--bots random,greedy,...] [--time 10m] [--resume] [--record games.mgn] [--write]
 *
 * --write saves the ratings to src/bots/ratings.ts, which the game's menus show.
 *
 * Games are played in matched pairs: an opening is set up once (see openings.ts), then each bot
 * plays it from both seats. An opening that favours one seat then comes out even, and a bot only
 * gains by outplaying the other from the same start. The default opening is the standard board
 * after two random moves; "symmetric" deals a random board that's the same from both seats.
 * Everything is seeded, so runs repeat. Search bots use a fixed depth here, so results don't
 * depend on the machine's speed.
 *
 * The tournament plays in rounds, one pair for every pairing, and saves a checkpoint after each
 * round. --time stops it after the round that crosses the budget; Ctrl+C stops it after the game
 * in progress (and drops the unfinished round). --resume carries on from the checkpoint.
 *
 * Ratings are fitted to all the results at once (a Bradley–Terry fit, read as Elo) rather than
 * updated game by game, so the order games were played in doesn't matter. Random is pinned at 1000.
 *
 * A caveat the output repeats: a 100% pairing only says one bot is much stronger, not how much.
 * Gaps like that are set by the closer pairings in between (and one virtual draw per pairing keeps
 * them finite), so each rating comes with a 90% range from re-fitting resampled pairs.
 */
import { type Bot, type BotId, BOTS, createBot, isBotId } from "../../src/bots/bots.ts";
import { playTurn } from "../../src/game/engine.ts";
import { formatGame } from "../../src/game/notation.ts";
import { type GameState, P1, P2, type Player } from "../../src/game/types.ts";
import { seeded } from "../match.ts";
import { type Checkpoint, load, save } from "./checkpoint.ts";
import { fit, ranges, sum } from "./elo.ts";
import { isOpening, type Opening, opening, OPENINGS } from "./openings.ts";

/** A flag's value: `--name value` or `--name=value`. */
function flag(name: string): string | undefined {
  const i = Deno.args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return Deno.args[i].includes("=") ? Deno.args[i].split("=")[1] : Deno.args[i + 1];
}
const VALUED = ["games", "time", "openings", "bots", "record"];
const positional = Deno.args.filter((a, i) => !a.startsWith("--") && !VALUED.includes(Deno.args[i - 1]?.slice(2)));

/** "90s", "10m", "1h" (or plain seconds) in milliseconds. */
function duration(s: string): number {
  const m = /^(\d+(?:\.\d+)?)([smh]?)$/.exec(s);
  if (!m) throw new Error(`--time ${s}: use 90s, 10m or 1h`);
  return Number(m[1]) * { "": 1000, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as "" | "s" | "m" | "h"];
}

const GAMES = Number(flag("games") ?? positional[0] ?? 40);
if (!(GAMES >= 2) || GAMES % 2) throw new Error("games per pairing must be even: each opening is played twice");
const ROUNDS = GAMES / 2;
const OPENING = flag("openings") ?? "random-moves";
if (!isOpening(OPENING)) throw new Error(`--openings ${OPENING}: use ${OPENINGS.join(", ")}`);
const timeFlag = flag("time");
const BUDGET = timeFlag === undefined ? Infinity : duration(timeFlag);

// One random stream for the bots and the openings, reseeded every round, so a resumed run plays
// exactly the games a run straight through would have.
let stream = seeded(711);
const rng = () => stream();
// Every bot in BOTS, or just those in --bots a,b,c. Random goes first: it's the anchor, pinned at 1000.
const picked = flag("bots")?.split(",") ?? Object.keys(BOTS);
const unknown = picked.filter((id) => !isBotId(id));
if (unknown.length) throw new Error(`--bots: no bot called ${unknown.join(", ")}; try ${Object.keys(BOTS).join(",")}`);
if (!picked.includes("random")) throw new Error("--bots must include random, the anchor");
const ids = ["random", ...picked.filter((id) => id !== "random")] as BotId[];
if (Deno.args.includes("--write") && ids.length < Object.keys(BOTS).length) {
  throw new Error("--write rates every bot in BOTS together; leave out --bots");
}
const entrants: [string, Bot][] = ids.map((id) => [BOTS[id].label, createBot(id, { rng, mode: "rate" })]);
const n = entrants.length;
const names: string[] = ids;

/** One game from `start`, `a` on Player 1's side and `b` on Player 2's: the winner (null for a draw) and the moves. */
function game(a: Bot, b: Bot, start: GameState): { winner: Player | null; moves: number[] } {
  let g = start;
  const moves: number[] = [];
  for (let ply = 0; !g.gameOver && ply < 1000; ply++) {
    const move = (g.current === P1 ? a : b).choose(g);
    if (move === null) break;
    const r = playTurn(g, move, { record: false });
    if (r.invalid) throw new Error("illegal move");
    moves.push(move);
    g = r.state;
  }
  const [x, y] = [g.pits[14], g.pits[15]];
  return { winner: x === y ? null : x > y ? P1 : P2, moves };
}

// --record games.mgn: every game, in MGN (src/game/notation.ts), appended a round at a time.
const RECORD = flag("record");

let state: Checkpoint = {
  opening: OPENING,
  bots: names,
  rounds: 0,
  results: Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[])),
  firstWon: 0,
  decided: 0,
};
if (Deno.args.includes("--resume")) {
  const saved = await load();
  if (!saved) throw new Error("--resume: no checkpoint to resume");
  if (saved.opening !== OPENING || saved.bots.join() !== names.join()) {
    throw new Error(`--resume: the checkpoint is for --openings ${saved.opening} with ${saved.bots.join(", ")}`);
  }
  state = saved;
}

// Ctrl+C once: stop after the game in progress. Twice: stop now.
let stopping = false;
const onInterrupt = () => {
  if (stopping) Deno.exit(130);
  stopping = true;
};
Deno.addSignalListener("SIGINT", onInterrupt);

// A live progress line, on the terminal only, so piped output stays a clean table.
const live = Deno.stderr.isTerminal();
const startedAt = performance.now();
const startRounds = state.rounds;
const perRound = (n * (n - 1)) / 2;
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
function progress(pairsThisRound: number) {
  if (!live) return;
  const elapsed = performance.now() - startedAt;
  const games = ((state.rounds - startRounds) * perRound + pairsThisRound) * 2;
  const rate = games / (elapsed / 1000);
  const left = (ROUNDS - state.rounds) * perRound * 2 - pairsThisRound * 2;
  const eta = Math.min(left / rate * 1000, BUDGET - elapsed);
  const line = `Round ${state.rounds + 1}/${ROUNDS} · ${games} games · ${rate.toFixed(1)} games/s · ` +
    `${clock(elapsed)} elapsed · ETA ${rate > 0 && Number.isFinite(eta) ? clock(Math.max(0, eta)) : "--:--"}` +
    (stopping ? " · stopping" : "");
  Deno.stderr.writeSync(new TextEncoder().encode(`\r${line.padEnd(90)}`));
}

while (state.rounds < ROUNDS && !stopping && performance.now() - startedAt < BUDGET) {
  stream = seeded(711_000 + state.rounds);
  const round = state.results.map((row) => row.map(() => [] as number[]));
  let firstWon = 0, decided = 0, pairs = 0;
  const recorded: string[] = [];
  for (let i = 0; i < n && !stopping; i++) {
    for (let j = i + 1; j < n && !stopping; j++) {
      // Alternate who moves first from round to round; within a pair, the seats swap.
      const first = state.rounds % 2 ? P2 : P1;
      const start = opening(OPENING, first, rng);
      for (const [p1, p2] of [[i, j], [j, i]]) {
        const { winner: w, moves } = game(entrants[p1][1], entrants[p2][1], start.state);
        if (RECORD) {
          recorded.push(formatGame({
            tags: { Event: "Tournament", Opening: OPENING, Round: String(state.rounds + 1), P1: ids[p1], P2: ids[p2] },
            rules: start.state.rules,
            first,
            layout: start.layout,
            moves: [...start.moves, ...moves],
          }));
        }
        const forI = w === null ? 0.5 : (w === P1 ? p1 : p2) === i ? 1 : 0;
        round[i][j].push(forI);
        round[j][i].push(1 - forI);
        if (w !== null) {
          decided++;
          if (w === first) firstWon++;
        }
      }
      progress(++pairs);
      // Let Ctrl+C get through between pairs.
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (stopping) break;
  round.forEach((row, i) => row.forEach((games, j) => state.results[i][j].push(...games)));
  state.firstWon += firstWon;
  state.decided += decided;
  state.rounds++;
  if (RECORD) await Deno.writeTextFile(RECORD, recorded.join("\n") + "\n", { append: true });
  await save(state);
}
Deno.removeSignalListener("SIGINT", onInterrupt);
if (live) Deno.stderr.writeSync(new TextEncoder().encode(`\r${" ".repeat(90)}\r`));

if (state.rounds === 0) {
  console.log("No complete rounds yet, so no ratings.");
  Deno.exit(0);
}
const { results, firstWon, decided } = state;
const played = state.rounds * 2;
const rating = fit(results).map(Math.round);
const range = ranges(results, seeded(711), 2);

const order = [...entrants.keys()].sort((a, b) => rating[b] - rating[a]);
console.log("| Bot | Elo | 90% range | Won |");
console.log("| --- | ---: | :---: | ---: |");
for (const i of order) {
  const all = results[i].flat();
  const rng90 = i === 0 ? "anchor" : `${range[i][0]}–${range[i][1]}`;
  console.log(`| ${entrants[i][0]} | ${rating[i]} | ${rng90} | ${Math.round((sum(all) / all.length) * 100)}% |`);
}

console.log(`\n| Wins against → | ${order.map((i) => entrants[i][0]).join(" | ")} |`);
console.log(`| --- | ${order.map(() => "---:").join(" | ")} |`);
for (const i of order) {
  const cells = order.map((j) => (i === j ? "–" : `${Math.round((sum(results[i][j]) / results[i][j].length) * 100)}%`));
  console.log(`| **${entrants[i][0]}** | ${cells.join(" | ")} |`);
}
const describeOpening: Record<Opening, string> = {
  "random-moves": "the standard board after two random moves",
  symmetric: "a random board that's the same from both seats",
  standard: "the standard board",
};
console.log(
  `\n${played} games per pairing${played < GAMES ? ` (stopped early; ${GAMES} planned)` : ""}, as ${state.rounds} ` +
    `matched ${state.rounds === 1 ? "pair" : "pairs"}: each opening (${
      describeOpening[OPENING]
    }) played once from each seat. ` +
    `The player moving first won ${Math.round((firstWon / decided) * 100)}% of decided games.
A 100% pairing only shows one bot is much stronger; those gaps come from the closer pairings ` +
    `in between, hence the ranges.`,
);

if (Deno.args.includes("--write")) {
  const entries = order.map((i) => {
    const id = ids[i];
    return `  ${id}: { elo: ${rating[i]}, low: ${i === 0 ? rating[i] : range[i][0]}, high: ${
      i === 0 ? rating[i] : range[i][1]
    } },`;
  });
  const file = new URL("../../src/bots/ratings.ts", import.meta.url);
  await Deno.writeTextFile(
    file,
    `/**
 * Elo ratings from \`deno task tournament ${played} --openings ${OPENING} --write\` (${played} games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range.
 */
export const RATINGS_VERSION = "${new Date().toISOString().slice(0, 10)}";

export const RATINGS: Record<string, { elo: number; low: number; high: number }> = {
${entries.join("\n")}
};
`,
  );
  console.log("\nWrote src/bots/ratings.ts");
}
