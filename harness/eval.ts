/**
 * A bot's report card: how fast it is, how often it plays a perfect move, and where it lands on
 * the ladder, in one run, written to lab/results/<bot>.md. What every new bot gets measured by.
 *
 *   npm run eval -- <bot id> [--games 60] [--workers 4] [--positions 100] [--no-rating]
 *
 * Speed: ms a move, early in the game and later on. Accuracy: harness/accuracy.ts on the standard
 * board (solved positions are cached in data/accuracy/, so only the first run solves them), next
 * to Minimax and Greedy. Placement: the rating harness (harness/rate/) with Random and five rated
 * bots spread across the ladder, `--games` a pairing; it replaces the rating harness's checkpoint.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { BOTS, type BotId, createBot, DORMANT, isBotId, isDormantId } from "../src/bots/bots.ts";
import type { BotSpec, DormantSpec } from "../src/bots/contracts.ts";
import { RATINGS } from "../src/bots/ratings.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";
import { score, solvedPositions } from "./accuracy.ts";
import { seeded } from "./match.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : Number(args[i + 1]);
};
const id = args[0];
if (!id || !(isBotId(id) || isDormantId(id))) {
  console.error(`Usage: npm run eval -- <bot id> [--games 60] [--workers 4] [--positions 100] [--no-rating]`);
  console.error(`Bots: ${[...Object.keys(BOTS), ...Object.keys(DORMANT)].join(", ")}`);
  process.exit(1);
}
const spec: BotSpec | DormantSpec = isDormantId(id) ? DORMANT[id] : BOTS[id];
const games = flag("games", 60), workers = flag("workers", 4), count = flag("positions", 100);
const make = (bot: string) => createBot(bot as BotId, { mode: "rate", rng: seeded(1) });
const log = (s: string) => process.stderr.write(`\r${s}`.padEnd(60));

// --- Speed: early in the game (the first ten moves, where search is widest) and later ---------
const rng = seeded(7);
const early: GameState[] = [];
while (early.length < 60) {
  let s = newGame(DEFAULT_RULES, rng() < 0.5 ? P1 : P2);
  for (let ply = Math.floor(rng() * 10); ply > 0 && !s.gameOver; ply--) {
    const moves = validMoves(s);
    s = playTurn(s, moves[Math.floor(rng() * moves.length)]).state;
  }
  if (!s.gameOver) early.push(s);
}
const timeOn = (states: GameState[]) => {
  const bot = make(id), t = performance.now();
  for (const s of states) bot.choose(s);
  return (performance.now() - t) / states.length;
};
log("timing");
const msEarly = timeOn(early);

// --- Accuracy against perfect play -------------------------------------------------------------
const positions = solvedPositions(7, count, log);
const msLater = timeOn(positions.map((p) => p.state));
const accuracy = [
  [spec.label, score(make(id), positions)],
  ["Minimax (Expert)", score(make("minimax"), positions)],
  ["Greedy", score(make("greedy"), positions)],
] as const;

// --- Placement: a short rating run against bots across the ladder -------------------------------
type Row = { name: string; elo: string; range: string };
let placement: Row[] = [];
if (!args.includes("--no-rating")) {
  const ladder = (Object.keys(RATINGS) as BotId[]).filter((b) => isBotId(b) && b !== id)
    .sort((a, b) => RATINGS[a].elo - RATINGS[b].elo);
  const spread = [0, 1, 2, 3, 4].map((k) => ladder[Math.round((k * (ladder.length - 1)) / 4)]);
  const bots = [...new Set(["random", ...spread, id])];
  log(`rating against ${bots.length - 1} bots, ${games} games a pairing`);
  const out = execFileSync(
    process.execPath,
    ["harness/rate/main.ts", String(games), "--bots", bots.join(","), "--workers", String(workers)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  placement = [...out.matchAll(/^\| ([^|]+?) \| (\d+) \| (anchor|\d+–\d+) \|/gm)]
    .map(([, name, elo, range]) => ({ name, elo, range }));
}
process.stderr.write("\n");

// --- The report card ----------------------------------------------------------------------------
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
const mine = placement.find((r) => r.name === spec.label);
const rank = placement.findIndex((r) => r.name === spec.label);
const between = rank < 0
  ? ""
  : rank === 0
  ? `above ${placement[1]?.name}`
  : rank === placement.length - 1
  ? `below ${placement[rank - 1].name}`
  : `between ${placement[rank + 1].name} and ${placement[rank - 1].name}`;
const status = "status" in spec ? `${spec.status}: ${spec.why}` : `rated, ${RATINGS[id].elo} in the full rating`;
const lines = [
  `# ${spec.label} (\`${id}\`)`,
  "",
  `${spec.blurb}`,
  "",
  `- **Decides:** \`${spec.decides}\`; **judges:** \`${spec.judges}\``,
  `- **Status:** ${status}`,
  `- **Level:** ${spec.level}`,
  "",
  "## Speed",
  "",
  "| Where | ms a move |",
  "| --- | ---: |",
  `| Early in the game (the first ten moves) | ${msEarly.toFixed(2)} |`,
  `| Later (the positions below) | ${msLater.toFixed(2)} |`,
  "",
  `## Against perfect play (${positions.length} solved positions, standard board)`,
  "",
  "Perfect: its move keeps the position's value. Gives up: final-margin seeds lost against perfect play, on average.",
  "",
  "| Bot | Perfect | Gives up |",
  "| --- | ---: | ---: |",
  ...accuracy.map(([name, r], k) => `| ${k ? name : `**${name}**`} | ${pct(r.perfect)} | ${r.givesUp.toFixed(2)} |`),
  "",
];
if (placement.length) {
  lines.push(
    `## Placement (${games} games a pairing, Random and bots across the ladder)`,
    "",
    mine ? `**${mine.elo}** (90% range ${mine.range}), ${between}.` : "Not found in the rating's output.",
    "",
    "| Bot | Elo | 90% range |",
    "| --- | ---: | :---: |",
    ...placement.map((
      r,
    ) => (r.name === spec.label
      ? `| **${r.name}** | **${r.elo}** | ${r.range} |`
      : `| ${r.name} | ${r.elo} | ${r.range} |`)
    ),
    "",
  );
}
lines.push(`_\`npm run eval -- ${id}\`, ${new Date().toISOString().slice(0, 10)}._`, "");
const file = `lab/results/${id}.md`;
writeFileSync(file, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`Wrote ${file}`);
