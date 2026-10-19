/**
 * Every bot plays every other bot; prints Elo ratings and a win-rate table (as in the README).
 * docs/RATING.md is the guide: when to run it, how many games, and how to read the results.
 *
 *   npm run rate -- [games per pairing, default 40] [--openings random-moves|symmetric|standard]
 *                        [--bots random,greedy,...] [--time 10m] [--resume] [--record games.mgn] [--write]
 *                        [--workers N, default one per CPU core] [--adaptive] [--ui]
 *
 * --ui serves a live dashboard at http://localhost:8020/ (tools/dashboard/): the ladder with its
 * ranges against the ratings before the run, each bot's results, and the head-to-head table.
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
import { createWriteStream } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { type BotId, BOTS, DORMANT, type DormantId, isBotId, isDormantId } from "../../src/bots/bots.ts";
import { seeded } from "../match.ts";
import { type Checkpoint, load, save } from "./checkpoint.ts";
import { aboveShare, fit, misfits, rangesOf, resample, sum } from "./elo.ts";
import { isOpening, type Opening, OPENINGS } from "./openings.ts";
import type { PairJob, PairResult, PlayedGame } from "./play.ts";
import { Pool } from "./pool.ts";
import { plan, weight } from "./adaptive.ts";
import { RATINGS } from "../../src/bots/ratings.ts";
import type { History, Progress } from "../dashboard/snapshot.ts";

const ARGS = process.argv.slice(2);

/** A flag's value: `--name value` or `--name=value`. */
function flag(name: string): string | undefined {
  const i = ARGS.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return ARGS[i].includes("=") ? ARGS[i].split("=")[1] : ARGS[i + 1];
}
const VALUED = ["games", "time", "openings", "bots", "record", "workers"];
const positional = ARGS.filter((a, i) => !a.startsWith("--") && !VALUED.includes(ARGS[i - 1]?.slice(2)));

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
if (ARGS.includes("--write") && (ids.some(isDormantId) || ids.length < Object.keys(BOTS).length)) {
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
const ADAPTIVE = ARGS.includes("--adaptive");
const PLAN = ADAPTIVE ? plan(ids, RATINGS, GAMES) : null;

// Each bot's thinking time and moves, for Elo against time per move (this run's games only).
const think = ids.map(() => ({ ms: 0, moves: 0 }));
const addThink = (r: PairResult) => {
  for (const [k, bot] of [r.i, r.j].entries()) {
    [think[bot].ms, think[bot].moves] = [think[bot].ms + r.thinkMs[k], think[bot].moves + r.moves[k]];
  }
};

// --ui: the live dashboard. Loaded only when asked for, so a plain run doesn't pay for it.
const UI = ARGS.includes("--ui");
const dash = UI ? await (await import("../dashboard/server.ts")).Dashboard.start() : null;
const snapshots = UI ? await import("../dashboard/snapshot.ts") : null;
if (dash) console.error(`Dashboard: ${dash.url}`);
/** Games planned for each pairing, both ways round: what the dashboard's Games view shows. */
const PLANNED = ids.map((_, i) =>
  ids.map((_, j) => (i === j ? 0 : PLAN ? 2 * PLAN[Math.min(i, j)][Math.max(i, j)] : GAMES))
);
/** The dashboard's game viewer: each pairing's first KEEP_PAIRS matched pairs, as moves. */
const KEEP_PAIRS = 10;
const kept = new Map<string, PlayedGame[]>();
const keep = (r: PairResult) => {
  if (!r.kept.length) return;
  const key = `${r.i} ${r.j}`;
  kept.set(key, [...(kept.get(key) ?? []), ...r.kept]);
};
/** The dashboard's convergence charts: ratings as the run goes, and ranges when resampled. */
const history: History = { points: [], ranges: [] };
/** This round's finished pairings, not yet in state.results (rounds go in whole). */
const pending: PairResult[] = [];
let liveProgress: Omit<Progress, "status" | "elapsedMs"> = {
  done: 0,
  total: 0,
  unit: ADAPTIVE ? "pairs" : "rounds",
  games: 0,
  gamesPerSec: 0,
  etaMs: null,
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
if (ARGS.includes("--resume")) {
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
  if (stopping) process.exit(130);
  stopping = true;
};
process.on("SIGINT", onInterrupt);

// A live progress line, on the terminal only, so piped output stays a clean table.
const live = process.stderr.isTTY === true;
const startedAt = performance.now();
const startRounds = state.rounds;

// Every ETA the run predicts, with when it predicted it, for calibrating the ETA: a JSON line about
// once a second, and the actual total at the end (data/eta/<start time>.jsonl, git-ignored).
const etaLog = await (async () => {
  try {
    const dir = new URL("../../data/eta/", import.meta.url);
    await mkdir(dir, { recursive: true });
    const stream = createWriteStream(new URL(`${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`, dir));
    stream.on("error", () => {}); // a log that can't be written mustn't stop the run
    const run = { games: GAMES, bots: names, workers: WORKERS, adaptive: ADAPTIVE, opening: OPENING };
    stream.write(JSON.stringify({ run: { ...run, resumedFrom: state.rounds } }) + "\n");
    return stream;
  } catch {
    return null;
  }
})();
let etaLoggedAt = -Infinity;
function logEta(elapsed: number): void {
  if (!etaLog || elapsed - etaLoggedAt < 1000) return;
  etaLoggedAt = elapsed;
  const { done, total, unit, games, etaMs } = liveProgress;
  const eta = etaMs === null ? null : Math.round(etaMs);
  etaLog.write(JSON.stringify({ elapsedMs: Math.round(elapsed), etaMs: eta, done, total, unit, games }) + "\n");
}
const perRound = (n * (n - 1)) / 2;
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const columns = () => process.stderr.columns || 80;
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
  const elapsed = performance.now() - startedAt;
  const games = ((state.rounds - startRounds) * perRound + pairsThisRound) * 2;
  const rate = games / (elapsed / 1000);
  const left = eta(elapsed);
  liveProgress = { done: state.rounds, total: ROUNDS, unit: "rounds", games, gamesPerSec: rate, etaMs: left };
  refreshUi();
  logEta(elapsed);
  if (!live) return;
  const line = `Round ${state.rounds + 1}/${ROUNDS} · ${games} games · ${rate.toFixed(1)} games/s · ` +
    `${clock(elapsed)} elapsed · ETA ${left === null ? "after round 1" : clock(left)}` +
    (stopping ? " · stopping" : "");
  // Clear the line and rewrite it, cut to the terminal's width so it never wraps.
  process.stderr.write(`\r\x1b[2K${line.slice(0, columns() - 1)}`);
}

/**
 * Plays one round on the worker pool: every pairing once. Resolves with the results in pairing
 * order, or null if Ctrl+C stopped it (the pairings already sent are let finish, then dropped).
 */
async function playRound(round: number): Promise<PairResult[] | null> {
  const jobs: PairJob[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      jobs.push({
        round,
        i,
        j,
        a: ids[i],
        b: ids[j],
        opening: OPENING as Opening,
        record: !!RECORD,
        keep: UI && round < KEEP_PAIRS,
      });
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
    done: (k, ms, result) => {
      cost[k] = ms;
      finished[k] = true;
      pending.push(result);
      keep(result);
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
        jobs.push({
          round,
          i,
          j,
          a: ids[i],
          b: ids[j],
          opening: OPENING as Opening,
          record: !!RECORD,
          keep: UI && round < KEEP_PAIRS,
        });
      }
    }
  }
  const cost = (job: PairJob) => weight(job.a) + weight(job.b);
  const order = jobs.map((_, k) => k).sort((a, b) => cost(jobs[b]) - cost(jobs[a]) || a - b);
  const left = sum(jobs.map(cost));
  let doneCost = 0, sinceSave = 0, playedNow = 0, recorded: string[] = [];
  let saving = Promise.resolve();
  const flush = () => {
    const games = recorded;
    recorded = [];
    rebuild();
    recordHistory();
    saving = saving.then(async () => {
      if (RECORD && games.length) await appendFile(RECORD, games.join("\n") + "\n");
      await save(state);
    });
  };
  await pool.run(jobs, order, {
    stop: () => stopping || performance.now() - startedAt > BUDGET,
    done: (k, _ms, r) => {
      state.done![`${r.i} ${r.j} ${jobs[k].round}`] = [r.results[0], r.results[1], r.firstWon, r.decided];
      keep(r);
      addThink(r);
      recorded.push(...r.games);
      doneCost += cost(jobs[k]);
      // A checkpoint every 50 pairs.
      if (++sinceSave >= 50) {
        sinceSave = 0;
        flush();
      }
      const elapsed = performance.now() - startedAt;
      const doneNow = Object.keys(state.done!).length;
      const eta = doneCost ? elapsed * (left - doneCost) / doneCost : null;
      playedNow++;
      liveProgress = {
        done: doneNow,
        total,
        unit: "pairs",
        games: doneNow * 2,
        gamesPerSec: (playedNow * 2) / (elapsed / 1000),
        etaMs: eta,
      };
      refreshUi();
      logEta(elapsed);
      if (!live) return;
      const line =
        `Adaptive · ${doneNow}/${total} pairs · ${clock(elapsed)} elapsed · ETA ${
          eta === null ? "--:--" : clock(eta)
        }` + (stopping ? " · stopping" : "");
      process.stderr.write(`\r\x1b[2K${line.slice(0, columns() - 1)}`);
    },
  });
  flush();
  await saving;
}

/** The results so far, with this round's finished pairings: what the dashboard shows. */
function liveResults(): { results: number[][][]; think: typeof think; firstWon: number; decided: number } {
  if (ADAPTIVE) {
    rebuild();
    return { results: state.results, think, firstWon: state.firstWon, decided: state.decided };
  }
  const results = state.results.map((row) => row.map((games) => games.slice()));
  const t = think.map((x) => ({ ...x }));
  let { firstWon, decided } = state;
  for (const r of pending) {
    results[r.i][r.j].push(...r.results);
    results[r.j][r.i].push(...r.results.map((x) => 1 - x));
    for (const [k, bot] of [r.i, r.j].entries()) {
      [t[bot].ms, t[bot].moves] = [t[bot].ms + r.thinkMs[k], t[bot].moves + r.moves[k]];
    }
    firstWon += r.firstWon;
    decided += r.decided;
  }
  return { results, think: t, firstWon, decided };
}

let uiTimer: ReturnType<typeof setTimeout> | undefined;
let finishedMs: number | null = null;
/** Sends the dashboard a snapshot, and asks for new ranges when they're due. */
function publishUi(status: Progress["status"] = stopping ? "stopping" : "running"): void {
  if (!dash || !snapshots) return;
  const { results, think: t, firstWon, decided } = liveResults();
  const games = sum(results.map((row) => sum(row.map((g) => g.length)))) / 2;
  if (status !== "done" && snapshots.rangesDue(games, dash.samplesGames, performance.now() - dash.askedAt)) {
    dash.requestRanges(results, games);
  }
  dash.publish(snapshots.buildSnapshot({
    bots: ids.map((id, i) => ({ id, label: labels[i], level: (isDormantId(id) ? DORMANT[id] : BOTS[id]).level })),
    results,
    previous: ids.map((id) => RATINGS[id] ?? null),
    think: t,
    samples: dash.samples,
    samplesRating: dash.samplesRating,
    samplesGames: dash.samplesGames,
    firstWon,
    decided,
    progress: { ...liveProgress, status, elapsedMs: finishedMs ?? performance.now() - startedAt },
    run: { opening: OPENING, workers: WORKERS, adaptive: ADAPTIVE, gamesPerPairing: GAMES },
    planned: PLANNED,
    history,
  }));
}
/** At most one snapshot a second, and none while no page is open. */
function refreshUi(): void {
  if (!dash?.watching || uiTimer) return;
  uiTimer = setTimeout(() => {
    uiTimer = undefined;
    publishUi();
  }, 1000);
}
/** A point on the convergence chart: every bot's rating now. One fit, a few ms; only with --ui. */
function recordHistory(): void {
  if (!dash) return;
  const games = sum(state.results.map((row) => sum(row.map((g) => g.length)))) / 2;
  if (!games || history.points.at(-1)?.games === games) return;
  history.points.push({ games, elo: fit(state.results).map(Math.round) });
}
/** The ranges at the time they were resampled, for the chart of how wide they still are. */
function recordRanges(): void {
  if (!dash?.samples || history.ranges.at(-1)?.games === dash.samplesGames) return;
  // Ranges from the first few games say nothing yet: the chart starts where the ratings' does.
  if (!history.points.length || dash.samplesGames < history.points[0].games) return;
  const range = rangesOf(dash.samples);
  history.ranges.push({ games: dash.samplesGames, low: range.map((r) => r[0]), high: range.map((r) => r[1]) });
}
if (dash) {
  dash.onWatch = () => publishUi();
  dash.onRanges = () => {
    recordRanges();
    publishUi();
  };
  dash.gamesFor = (i, j) => kept.get(`${Math.min(i, j)} ${Math.max(i, j)}`) ?? [];
}

if (ADAPTIVE) await playAdaptive();
else {while (state.rounds < ROUNDS && !stopping && performance.now() - startedAt < BUDGET) {
    const round = await playRound(state.rounds);
    if (!round) {
      pending.length = 0;
      break;
    }
    const recorded: string[] = [];
    for (const r of round) addThink(r);
    for (const { i, j, results, firstWon, decided, games } of round) {
      state.results[i][j].push(...results);
      state.results[j][i].push(...results.map((x) => 1 - x));
      state.firstWon += firstWon;
      state.decided += decided;
      recorded.push(...games);
    }
    pending.length = 0;
    state.rounds++;
    recordHistory();
    if (RECORD) await appendFile(RECORD, recorded.join("\n") + "\n");
    await save(state);
  }}
pool.close();
process.off("SIGINT", onInterrupt);
// The actual total, for the ETA log: what every prediction above should have said.
etaLog?.end(
  JSON.stringify({
    finishedMs: Math.round(performance.now() - startedAt),
    games: liveProgress.games,
    complete: ADAPTIVE ? !stopping && performance.now() - startedAt <= BUDGET : state.rounds >= ROUNDS,
  }) + "\n",
);
if (live) process.stderr.write("\r\x1b[2K");

if (state.rounds === 0) {
  console.log(ADAPTIVE ? "No pairs played yet, so no ratings." : "No complete rounds yet, so no ratings.");
  process.exit(0);
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

if (ARGS.includes("--write")) {
  const entries = order.map((i, k) => {
    const id = ids[i];
    const next = above[k] === null ? "" : `, above: ${above[k]!.toFixed(2)}`;
    return `  ${id}: { elo: ${rating[i]}, low: ${i === 0 ? rating[i] : range[i][0]}, high: ${
      i === 0 ? rating[i] : range[i][1]
    }${next} },`;
  });
  const file = new URL("../../src/bots/ratings.ts", import.meta.url);
  await writeFile(
    file,
    `/**
 * Elo ratings from \`npm run rate -- ${GAMES}${ADAPTIVE ? " --adaptive" : ""} --openings ${OPENING} --write\` (${
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
  await mkdir(new URL("../../data/", import.meta.url), { recursive: true });
  const rows = order.map((i) => ({
    id: ids[i],
    label: labels[i],
    elo: rating[i],
    low: range[i][0],
    high: range[i][1],
    msPerMove: msPerMove(i),
  }));
  await writeFile(
    new URL("../../data/elo-time.json", import.meta.url),
    JSON.stringify({ workers: WORKERS, rows }, null, 2),
  );
} catch { /* data/ isn't writable: the table above has the same numbers */ }

// The dashboard's last snapshot: the same ratings and ranges as the table above. It stays up.
if (dash) {
  clearTimeout(uiTimer);
  finishedMs = performance.now() - startedAt;
  [dash.samples, dash.samplesRating, dash.samplesGames] = [samples, fit(results), allGames];
  liveProgress = { ...liveProgress, etaMs: 0 };
  recordHistory();
  recordRanges();
  dash.stopRanges();
  publishUi("done");
  console.error(`
The dashboard stays open at ${dash.url}. Ctrl+C to quit.`);
  dash.stayOpen();
}
