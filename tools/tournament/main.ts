/**
 * Every bot plays every other bot; prints Elo ratings and a win-rate table (as in the README).
 * docs/RATING.md is the guide: when to run it, how many games, and how to read the results.
 *
 *   deno task rate [games per pairing, default 40] [--openings random-moves|symmetric|standard]
 *                        [--bots random,greedy,...] [--time 10m] [--resume] [--record games.mgn] [--write]
 *                        [--workers N, default one per CPU core] [--adaptive]
 *
 * --write saves the ratings to src/bots/ratings.ts, which the game's menus show.
 *
 * --adaptive gives close pairings more games and lopsided ones fewer (adaptive.ts), planned from
 * the current ratings before the run, and plays them all from one queue instead of in rounds.
 *
 * Games are played in matched pairs: an opening is set up once (see openings.ts), then each bot
 * plays it from both seats. An opening that favours one seat then comes out even, and a bot only
 * gains by outplaying the other from the same start. The default opening is the standard board
 * after two random moves; "symmetric" deals a random board that's the same from both seats.
 * Everything is seeded, so runs repeat: each pairing has its own seed (play.ts), so the pairings
 * run in parallel on a pool of workers and the results don't depend on how many. Search bots use
 * a fixed depth here, so results don't depend on the machine's speed either.
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
import { type BotId, BOTS, DORMANT, type DormantId, isBotId, isDormantId } from "../../src/bots/bots.ts";
import { seeded } from "../match.ts";
import { type Checkpoint, load, save } from "./checkpoint.ts";
import { aboveShare, fit, misfits, rangesOf, resample, sum } from "./elo.ts";
import { isOpening, type Opening, OPENINGS } from "./openings.ts";
import type { PairJob, PairResult } from "./play.ts";
import { Pool } from "./pool.ts";
import { plan, weight } from "./adaptive.ts";
import { RATINGS } from "../../src/bots/ratings.ts";

/** A flag's value: `--name value` or `--name=value`. */
function flag(name: string): string | undefined {
  const i = Deno.args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return Deno.args[i].includes("=") ? Deno.args[i].split("=")[1] : Deno.args[i + 1];
}
const VALUED = ["games", "time", "openings", "bots", "record", "workers"];
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

// Every bot in BOTS, or just those in --bots a,b,c (which may name dormant bots too). Random goes
// first: it's the anchor, pinned at 1000.
const picked = flag("bots")?.split(",") ?? Object.keys(BOTS);
const unknown = picked.filter((id) => !isBotId(id) && !isDormantId(id));
if (unknown.length) throw new Error(`--bots: no bot called ${unknown.join(", ")}; try ${Object.keys(BOTS).join(",")}`);
if (!picked.includes("random")) throw new Error("--bots must include random, the anchor");
const ids = ["random", ...picked.filter((id) => id !== "random")] as (BotId | DormantId)[];
if (Deno.args.includes("--write") && (ids.some(isDormantId) || ids.length < Object.keys(BOTS).length)) {
  throw new Error("--write rates exactly the bots in BOTS together; leave out --bots");
}
const labels = ids.map((id) => (isDormantId(id) ? DORMANT[id] : BOTS[id]).label);
const n = ids.length;
const names: string[] = ids;

// --record games.mgn: every game, in MGN (src/game/notation.ts), appended a round at a time.
const RECORD = flag("record");

// Pairings are played in parallel, one per worker (play.ts has the games themselves). Each has its
// own seed, so the results are the same for any number of workers.
const WORKERS = Math.max(1, Math.floor(Number(flag("workers") ?? navigator.hardwareConcurrency ?? 4)));
const pool = new Pool(WORKERS);

// --adaptive: close pairings many games, lopsided ones few, fixed before the run from ratings.ts.
const ADAPTIVE = Deno.args.includes("--adaptive");
const PLAN = ADAPTIVE ? plan(ids, RATINGS, GAMES) : null;

// Each bot's thinking time and moves, for Elo against time per move (this run's games only).
const think = ids.map(() => ({ ms: 0, moves: 0 }));
const addThink = (r: PairResult) => {
  for (const [k, bot] of [r.i, r.j].entries()) {
    [think[bot].ms, think[bot].moves] = [think[bot].ms + r.thinkMs[k], think[bot].moves + r.moves[k]];
  }
};

let state: Checkpoint = {
  opening: OPENING,
  bots: names,
  rounds: 0,
  results: Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[])),
  firstWon: 0,
  decided: 0,
  ...(PLAN ? { plan: PLAN, done: {} } : {}),
};
if (Deno.args.includes("--resume")) {
  const saved = await load();
  if (!saved) throw new Error("--resume: no checkpoint to resume");
  if (saved.opening !== OPENING || saved.bots.join() !== names.join()) {
    throw new Error(`--resume: the checkpoint is for --openings ${saved.opening} with ${saved.bots.join(", ")}`);
  }
  if (JSON.stringify(saved.plan ?? null) !== JSON.stringify(PLAN)) {
    throw new Error("--resume: the checkpoint was planned differently (--adaptive, or other ratings or games)");
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
const columns = () => {
  try {
    return Deno.consoleSize().columns;
  } catch {
    return 80;
  }
};
// Every round plays the same pairings, so rounds take about as long as each other, while single
// pairings differ a thousandfold (Random against First, or anything with Minimax). So the ETA
// counts rounds, not games: the rounds left at the recent round time, plus what's left of this
// round, weighted by how long each of its pairings took last time.
const cost: number[] = []; // each pairing's last time, in ms, by its index in the round
const roundTimes: number[] = []; // complete rounds this run, in ms
let finished: boolean[] = []; // this round's pairings that are done
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function eta(elapsed: number): number | null {
  if (!roundTimes.length) return null;
  const round = median(roundTimes.slice(-5));
  const total = sum(cost);
  const unfinished = sum(cost.filter((_, k) => !finished[k]));
  const left = (ROUNDS - state.rounds - 1) * round + (total > 0 ? round * unfinished / total : round);
  return Math.max(0, Math.min(left, BUDGET - elapsed));
}
function progress(pairsThisRound: number) {
  if (!live) return;
  const elapsed = performance.now() - startedAt;
  const games = ((state.rounds - startRounds) * perRound + pairsThisRound) * 2;
  const rate = games / (elapsed / 1000);
  const left = eta(elapsed);
  const line = `Round ${state.rounds + 1}/${ROUNDS} · ${games} games · ${rate.toFixed(1)} games/s · ` +
    `${clock(elapsed)} elapsed · ETA ${left === null ? "after round 1" : clock(left)}` +
    (stopping ? " · stopping" : "");
  // Clear the line and rewrite it, cut to the terminal's width so it never wraps.
  Deno.stderr.writeSync(new TextEncoder().encode(`\r\x1b[2K${line.slice(0, columns() - 1)}`));
}

/**
 * Plays one round on the worker pool: every pairing once. Resolves with the results in pairing
 * order, or null if Ctrl+C stopped it (the pairings already sent are let finish, then dropped).
 */
async function playRound(round: number): Promise<PairResult[] | null> {
  const jobs: PairJob[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      jobs.push({ round, i, j, a: ids[i], b: ids[j], opening: OPENING as Opening, record: !!RECORD });
    }
  }
  // Slowest pairings first (by last round's times), so the round doesn't end with one long
  // pairing running while the other workers wait. Results don't change: each pairing has its own
  // seed and its own slot.
  const order = jobs.map((_, k) => k).sort((a, b) => (cost[b] ?? 0) - (cost[a] ?? 0));
  finished = jobs.map(() => false);
  const startedRound = performance.now();
  let done = 0;
  const out = await pool.run(jobs, order, {
    stop: () => stopping,
    done: (k, ms) => {
      cost[k] = ms;
      finished[k] = true;
      progress(++done);
    },
  });
  if (out) roundTimes.push(performance.now() - startedRound);
  return out;
}

/** Rebuilds the results from the adaptive pairs done, in plan order, so the fit and its ranges repeat. */
function rebuild(): void {
  state.results = Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));
  state.firstWon = state.decided = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let round = 0; round < PLAN![i][j]; round++) {
        const d = state.done![`${i} ${j} ${round}`];
        if (!d) continue;
        state.results[i][j].push(d[0], d[1]);
        state.results[j][i].push(1 - d[0], 1 - d[1]);
        state.firstWon += d[2];
        state.decided += d[3];
      }
    }
  }
  state.rounds = Object.keys(state.done!).length;
}

/** --adaptive: every planned pair from one queue, the costliest pairings first. */
async function playAdaptive(): Promise<void> {
  const jobs: PairJob[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let round = 0; round < PLAN![i][j]; round++, total++) {
        if (state.done![`${i} ${j} ${round}`]) continue;
        jobs.push({ round, i, j, a: ids[i], b: ids[j], opening: OPENING as Opening, record: !!RECORD });
      }
    }
  }
  const cost = (job: PairJob) => weight(job.a) + weight(job.b);
  const order = jobs.map((_, k) => k).sort((a, b) => cost(jobs[b]) - cost(jobs[a]) || a - b);
  const left = sum(jobs.map(cost));
  let doneCost = 0, sinceSave = 0, recorded: string[] = [];
  let saving = Promise.resolve();
  const flush = () => {
    const games = recorded;
    recorded = [];
    rebuild();
    saving = saving.then(async () => {
      if (RECORD && games.length) await Deno.writeTextFile(RECORD, games.join("\n") + "\n", { append: true });
      await save(state);
    });
  };
  await pool.run(jobs, order, {
    stop: () => stopping || performance.now() - startedAt > BUDGET,
    done: (k, _ms, r) => {
      state.done![`${r.i} ${r.j} ${jobs[k].round}`] = [r.results[0], r.results[1], r.firstWon, r.decided];
      addThink(r);
      recorded.push(...r.games);
      doneCost += cost(jobs[k]);
      // A checkpoint every 50 pairs.
      if (++sinceSave >= 50) {
        sinceSave = 0;
        flush();
      }
      if (!live) return;
      const elapsed = performance.now() - startedAt;
      const doneNow = Object.keys(state.done!).length;
      const eta = doneCost ? elapsed * (left - doneCost) / doneCost : null;
      const line =
        `Adaptive · ${doneNow}/${total} pairs · ${clock(elapsed)} elapsed · ETA ${
          eta === null ? "--:--" : clock(eta)
        }` + (stopping ? " · stopping" : "");
      Deno.stderr.writeSync(new TextEncoder().encode(`\r\x1b[2K${line.slice(0, columns() - 1)}`));
    },
  });
  flush();
  await saving;
}

if (ADAPTIVE) await playAdaptive();
else {while (state.rounds < ROUNDS && !stopping && performance.now() - startedAt < BUDGET) {
    const round = await playRound(state.rounds);
    if (!round) break;
    const recorded: string[] = [];
    for (const r of round) addThink(r);
    for (const { i, j, results, firstWon, decided, games } of round) {
      state.results[i][j].push(...results);
      state.results[j][i].push(...results.map((x) => 1 - x));
      state.firstWon += firstWon;
      state.decided += decided;
      recorded.push(...games);
    }
    state.rounds++;
    if (RECORD) await Deno.writeTextFile(RECORD, recorded.join("\n") + "\n", { append: true });
    await save(state);
  }}
pool.close();
Deno.removeSignalListener("SIGINT", onInterrupt);
if (live) Deno.stderr.writeSync(new TextEncoder().encode("\r\x1b[2K"));

if (state.rounds === 0) {
  console.log(ADAPTIVE ? "No pairs played yet, so no ratings." : "No complete rounds yet, so no ratings.");
  Deno.exit(0);
}
const { results, firstWon, decided } = state;
const played = state.rounds * 2;
const rating = fit(results).map(Math.round);
const samples = resample(results, seeded(711), 2);
const range = rangesOf(samples);

const order = [...ids.keys()].sort((a, b) => rating[b] - rating[a]);
// "Above next": the share of resamples in which each bot rates above the next one down.
const above = order.map((i, k) => (k + 1 < order.length ? aboveShare(samples, i, order[k + 1]) : null));
const msPerMove = (i: number) => think[i].moves ? think[i].ms / think[i].moves : null;
console.log("| Bot | Elo | 90% range | Above next | Won | ms a move |");
console.log("| --- | ---: | :---: | ---: | ---: | ---: |");
for (const [k, i] of order.entries()) {
  const all = results[i].flat();
  const rng90 = i === 0 ? "anchor" : `${range[i][0]}–${range[i][1]}`;
  const next = above[k] === null ? "–" : `${Math.round(above[k]! * 100)}%`;
  const won = `${Math.round((sum(all) / all.length) * 100)}%${ADAPTIVE ? ` of ${all.length}` : ""}`;
  const ms = msPerMove(i);
  console.log(
    `| ${labels[i]} | ${rating[i]} | ${rng90} | ${next} | ${won} | ${
      ms === null ? "–" : ms < 1 ? ms.toFixed(2) : ms.toFixed(1)
    } |`,
  );
}

console.log(`\n| Wins against → | ${order.map((i) => labels[i]).join(" | ")} |`);
console.log(`| --- | ${order.map(() => "---:").join(" | ")} |`);
for (const i of order) {
  const cells = order.map((j) =>
    i === j
      ? "–"
      : `${Math.round((sum(results[i][j]) / results[i][j].length) * 100)}%${
        ADAPTIVE ? ` (${results[i][j].length})` : ""
      }`
  );
  console.log(`| **${labels[i]}** | ${cells.join(" | ")} |`);
}
const misses = misfits(results, rating);
console.log(
  misses.length
    ? `\nModel check: ${misses.length} pairing${
      misses.length === 1 ? "" : "s"
    } the ratings don't explain (more than 3 standard errors off):\n` +
      misses.map((m) =>
        `- ${labels[m.i]} against ${labels[m.j]}: scored ${Math.round(m.observed * 100)}%, the ratings say ${
          Math.round(m.expected * 100)
        }% (${m.z > 0 ? "+" : ""}${m.z.toFixed(1)})`
      ).join("\n")
    : "\nModel check: every pairing's score is within chance of what the ratings predict.",
);

const describeOpening: Record<Opening, string> = {
  "random-moves": "the standard board after two random moves",
  symmetric: "a random board that's the same from both seats",
  standard: "the standard board",
};
const counts = ids.flatMap((_, i) => ids.slice(i + 1).map((_, k) => results[i][i + 1 + k].length));
const allGames = sum(counts);
const planned = PLAN ? 2 * sum(PLAN.flatMap((row, i) => row.slice(i + 1))) : 0;
const howMany = ADAPTIVE
  ? `${allGames} games${allGames < planned ? ` (stopped early; ${planned} planned)` : ""}, adaptive: ${
    Math.min(...counts)
  } to ${Math.max(...counts)} a pairing, more for close pairings (planned from ratings.ts, ${GAMES} at 50/50)`
  : `${played} games per pairing${played < GAMES ? ` (stopped early; ${GAMES} planned)` : ""}, as ${state.rounds} ` +
    `matched ${state.rounds === 1 ? "pair" : "pairs"}`;
console.log(
  `\n${howMany}: each opening (${describeOpening[OPENING]}) played once from each seat. ` +
    `The player moving first won ${Math.round((firstWon / decided) * 100)}% of decided games.
A 100% pairing only shows one bot is much stronger; those gaps come from the closer pairings ` +
    `in between, hence the ranges.`,
);

if (Deno.args.includes("--write")) {
  const entries = order.map((i, k) => {
    const id = ids[i];
    const next = above[k] === null ? "" : `, above: ${above[k]!.toFixed(2)}`;
    return `  ${id}: { elo: ${rating[i]}, low: ${i === 0 ? rating[i] : range[i][0]}, high: ${
      i === 0 ? rating[i] : range[i][1]
    }${next} },`;
  });
  const file = new URL("../../src/bots/ratings.ts", import.meta.url);
  await Deno.writeTextFile(
    file,
    `/**
 * Elo ratings from \`deno task rate ${GAMES}${ADAPTIVE ? " --adaptive" : ""} --openings ${OPENING} --write\` (${
      ADAPTIVE ? `${allGames} games, adaptive` : `${played} games per pairing`
    },
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range;
 * above is the share of resampled fits in which the bot rates above the next one down.
 */
export const RATINGS_VERSION = "${new Date().toISOString().slice(0, 10)}";

export const RATINGS: Record<string, { elo: number; low: number; high: number; above?: number }> = {
${entries.join("\n")}
};
`,
  );
  console.log("\nWrote src/bots/ratings.ts");
}

// Elo against time per move, for the chart (this run's games; wall-clock, so it depends on the machine).
try {
  await Deno.mkdir(new URL("../../data/", import.meta.url), { recursive: true });
  const rows = order.map((i) => ({
    id: ids[i],
    label: labels[i],
    elo: rating[i],
    low: range[i][0],
    high: range[i][1],
    msPerMove: msPerMove(i),
  }));
  await Deno.writeTextFile(
    new URL("../../data/elo-time.json", import.meta.url),
    JSON.stringify({ workers: WORKERS, rows }, null, 2),
  );
} catch { /* data/ isn't writable: the table above has the same numbers */ }
