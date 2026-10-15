/**
 * Every bot plays every other bot; prints Elo ratings and a win-rate table (as in the README).
 *
 *   deno task tournament [games per pairing, default 40] [--write]
 *
 * --write saves the ratings to src/bots/ratings.ts, which the game's menus show.
 *
 * Each game opens with two random moves (seeded, so runs repeat) and the bots take turns going
 * first. Search bots use a fixed depth here, so results don't depend on the machine's speed.
 *
 * Ratings are fitted to all the results at once (a Bradley–Terry fit, read as Elo) rather than
 * updated game by game, so the order games were played in doesn't matter. Random is pinned at 1000.
 *
 * A caveat the output repeats: a 100% pairing only says one bot is much stronger, not how much.
 * Gaps like that are set by the closer pairings in between (and one virtual draw per pairing keeps
 * them finite), so each rating comes with a 90% range from re-fitting resampled results.
 */
import {
  type Bot,
  DfsBot,
  FirstBot,
  GenerousBot,
  GreedyBot,
  LookaheadBot,
  MinimaxBot,
  PushoverBot,
  RandomBot,
} from "../../src/bots/bots.ts";
import { newGame, playTurn, validMoves } from "../../src/game/engine.ts";
import { DEFAULT_RULES, P1, P2, type Player } from "../../src/game/types.ts";
import { seeded } from "../match.ts";
import { fit, ranges, sum } from "./elo.ts";

const args = Deno.args.filter((a) => !a.startsWith("--"));
const GAMES = Number(args[0] ?? 40);
const rng = seeded(711);
const entrants: [string, Bot][] = [
  ["Random", new RandomBot(rng)],
  ["Generous", new GenerousBot(rng)],
  ["Pushover", new PushoverBot(4)],
  ["First", new FirstBot()],
  ["Greedy", new GreedyBot()],
  ["Lookahead", new LookaheadBot(2, 3, rng)],
  ["DFS", new DfsBot(8)],
  ["Minimax", new MinimaxBot({ depth: 6 })],
];
const n = entrants.length;

/** One game between `a` (Player 1's side) and `b`; returns the winner, or null for a draw. */
function game(a: Bot, b: Bot, first: Player): Player | null {
  let g = newGame(DEFAULT_RULES, first);
  for (let ply = 0; !g.gameOver && ply < 1000; ply++) {
    const moves = validMoves(g);
    const move = ply < 2 ? moves[Math.floor(rng() * moves.length)] : (g.current === P1 ? a : b).choose(g);
    if (move === null) break;
    const r = playTurn(g, move, { record: false });
    if (r.invalid) throw new Error("illegal move");
    g = r.state;
  }
  const [x, y] = [g.pits[14], g.pits[15]];
  return x === y ? null : x > y ? P1 : P2;
}

// results[i][j]: i's result in each game against j (1 a win, ½ a draw, 0 a loss)
const results = Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));
let firstWon = 0, decided = 0;
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    for (let k = 0; k < GAMES; k++) {
      // Alternate sides and who moves first, so neither has the edge.
      const [p1, p2] = k % 2 ? [i, j] : [j, i];
      const first = k % 4 < 2 ? P1 : P2;
      const w = game(entrants[p1][1], entrants[p2][1], first);
      const forI = w === null ? 0.5 : (w === P1 ? p1 : p2) === i ? 1 : 0;
      results[i][j].push(forI);
      results[j][i].push(1 - forI);
      if (w !== null) {
        decided++;
        if (w === first) firstWon++;
      }
    }
  }
}

const rating = fit(results).map(Math.round);
const range = ranges(results, rng);

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
console.log(
  `\n${GAMES} games per pairing, each opening with two random moves. The player moving first won ${
    Math.round((firstWon / decided) * 100)
  }% of decided games.
A 100% pairing only shows one bot is much stronger; those gaps come from the closer pairings ` +
    `in between, hence the ranges.`,
);

if (Deno.args.includes("--write")) {
  const entries = order.map((i) => {
    const id = entrants[i][0].toLowerCase();
    return `  ${id}: { elo: ${rating[i]}, low: ${i === 0 ? rating[i] : range[i][0]}, high: ${
      i === 0 ? rating[i] : range[i][1]
    } },`;
  });
  const file = new URL("../../src/bots/ratings.ts", import.meta.url);
  await Deno.writeTextFile(
    file,
    `/**
 * Elo ratings from \`deno task tournament ${GAMES} --write\` (${GAMES} games per pairing). Generated: don't edit.
 * Random is pinned at 1000; low and high bound the 90% range.
 */
export const RATINGS_VERSION = "${new Date().toISOString().slice(0, 10)}";

export const RATINGS: Record<string, { elo: number; low: number; high: number }> = {
${entries.join("\n")}
};
`,
  );
  console.log("\nWrote src/bots/ratings.ts");
}
