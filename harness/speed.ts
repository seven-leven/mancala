/**
 * How fast the engine and every bot are, and proof that a speed-up changed no move: 300 seeded
 * positions from varied games, every bot (rated and dormant, as rated: fixed depth, playouts and
 * seeds) choosing in each, timed; and the engine on its own, playing random games.
 *
 *   npm run speed -- --record   save every bot's moves as the baseline (data/speed/moves.json)
 *   npm run speed               time them again, and list any bot whose moves differ from the baseline
 *
 * Record before a speed-up, run after: a change is kept only if every bot plays the same moves.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BOTS, type BotId, createBot, DORMANT, type DormantId } from "../src/bots/bots.ts";
import { newGame, playTurn, turn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";
import { seeded } from "./match.ts";

const BASELINE = "data/speed/moves.json";
const record = process.argv.includes("--record");

// Positions: games where each side plays a random move a third of the time and Greedy's
// otherwise, cut after 0 to 40 moves; only real choices.
const rng = seeded(31), greedy = createBot("greedy");
const positions: GameState[] = [];
while (positions.length < 300) {
  let s = newGame(DEFAULT_RULES, rng() < 0.5 ? P1 : P2);
  for (let ply = Math.floor(rng() * 40); ply > 0 && !s.gameOver; ply--) {
    const moves = validMoves(s);
    s = playTurn(s, rng() < 0.33 ? moves[Math.floor(rng() * moves.length)] : greedy.choose(s)!, { record: false })
      .state;
  }
  if (!s.gameOver && validMoves(s).length > 1) positions.push(s);
}

// The engine alone: random games from the start, as Monte Carlo plays them.
{
  const r = seeded(5), start = newGame(DEFAULT_RULES, P1);
  let turns = 0;
  const t = performance.now();
  for (let g = 0; g < 100_000; g++) {
    const s = { ...start, pits: [...start.pits] };
    while (!s.gameOver) {
      const m = validMoves(s);
      turn(s, m[Math.floor(r() * m.length)]);
      turns++;
    }
  }
  const secs = (performance.now() - t) / 1000;
  console.log(
    `Engine: ${(turns / secs / 1e6).toFixed(2)}M turns/s (random games, ${(turns / 1e5).toFixed(1)} turns each)`,
  );
}

// Every bot: its move in every position (seeded per position), and its time a move.
const ids = [...Object.keys(BOTS), ...Object.keys(DORMANT)] as (BotId | DormantId)[];
const moves: Record<string, number[]> = {};
console.log("\n| Bot | ms a move | Moves |");
console.log("| --- | ---: | --- |");
const baseline: Record<string, number[]> | null = !record && existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : null;
let changed = 0;
for (const id of ids) {
  let ms = 0;
  moves[id] = positions.map((p, k) => {
    const bot = createBot(id, { mode: "rate", rng: seeded(1000 + k) });
    const t = performance.now();
    const m = bot.choose(p)!;
    ms += performance.now() - t;
    return m;
  });
  const before = baseline?.[id];
  const diff = before ? moves[id].filter((m, k) => m !== before[k]).length : -1;
  if (diff > 0) changed++;
  const verdict = diff < 0 ? (record ? "recorded" : "no baseline") : diff === 0 ? "same" : `**${diff} differ**`;
  console.log(`| ${id} | ${(ms / positions.length).toFixed(3)} | ${verdict} |`);
}
if (record) {
  mkdirSync("data/speed", { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(moves));
  console.log(`\nRecorded ${positions.length} moves for each of ${ids.length} bots in ${BASELINE}.`);
} else if (baseline) {
  console.log(
    changed ? `\n${changed} bot(s) play differently from the baseline.` : "\nEvery bot plays the same moves.",
  );
}
