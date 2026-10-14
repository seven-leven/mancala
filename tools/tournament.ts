/**
 * Every bot plays every other bot, and prints a win-rate table (as in the README).
 *
 *   deno task tournament [games per pairing, default 40]
 *
 * Each game opens with two random moves (seeded, so runs repeat) and the bots take turns going
 * first. Minimax searches a fixed 6 plies here, so results don't depend on how fast the machine is.
 */
import { type Bot, DfsBot, GreedyBot, MinimaxBot, RandomBot } from "../src/bots/bots.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, P1, P2, type Player } from "../src/game/types.ts";
import { seeded } from "./match.ts";

const GAMES = Number(Deno.args[0] ?? 40);
const rng = seeded(711);
const entrants: [string, Bot][] = [
  ["Random", new RandomBot(rng)],
  ["Greedy", new GreedyBot()],
  ["DFS", new DfsBot(8)],
  ["Minimax", new MinimaxBot({ depth: 6 })],
];

/** Returns the winner (or null for a draw) of one game between `a` (Player 1) and `b`. */
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

const wins = entrants.map(() => entrants.map(() => 0));
const firstWins = { count: 0, games: 0 };
for (let i = 0; i < entrants.length; i++) {
  for (let j = 0; j < entrants.length; j++) {
    if (i === j) continue;
    for (let k = 0; k < GAMES / 2; k++) {
      // i sits on Player 1's side; half the games each player moves first
      const first = k % 2 ? P1 : P2;
      const w = game(entrants[i][1], entrants[j][1], first);
      if (w === P1) wins[i][j] += 1;
      if (w !== null) {
        firstWins.games++;
        if (w === first) firstWins.count++;
      }
    }
  }
}

// wins[i][j] counts i's wins over j as Player 1; add i's wins as Player 2 from wins[j][i]'s losses.
const pct = (i: number, j: number) => {
  const won = wins[i][j] + (GAMES / 2 - wins[j][i]);
  return `${Math.round((won / GAMES) * 100)}%`;
};
const names = entrants.map(([n]) => n);
console.log(`| ${["Wins against →", ...names].join(" | ")} |`);
console.log(`| ${names.map(() => "---").concat("---").join(" | ")} |`);
for (let i = 0; i < names.length; i++) {
  console.log(`| **${names[i]}** | ${names.map((_, j) => (i === j ? "–" : pct(i, j))).join(" | ")} |`);
}
console.log(
  `\n${GAMES} games per pairing, ${GAMES / 2} going first each. The player moving first won ${
    Math.round((firstWins.count / firstWins.games) * 100)
  }% of decided games.`,
);
