/**
 * Games (MGN) to training data: one JSON line per position, with how the game turned out for the
 * player to move. This is what tuning the evaluation needs (Texel's method, issue #15): fit the
 * weights so the evaluation of each position predicts its result.
 *
 *   npm run rate -- 40 --record data/games.mgn
 *   npm run --silent positions -- data/games.mgn > data/positions.jsonl
 *
 * Each line: {"game":0,"ply":12,"pits":[...16],"toMove":1,"result":1,"margin":18}
 * result is 1 (the player to move went on to win), ½ or 0; margin is the final store difference
 * from their side. Finished positions are left out, since there's nothing left to predict.
 */
import { readFile } from "node:fs/promises";
import { parseGames, replay } from "../src/game/notation.ts";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: npm run --silent positions -- <games.mgn> [more.mgn ...] > positions.jsonl");
  process.exit(1);
}
let game = 0, rows = 0;
for (const file of files) {
  for (const record of parseGames(await readFile(file, "utf8"))) {
    const { states } = replay(record);
    const end = states.at(-1)!;
    const lead = end.pits[14] - end.pits[15]; // Player 1's view
    for (const [ply, s] of states.entries()) {
      if (s.gameOver) continue;
      const margin = s.current === 1 ? lead : -lead;
      const result = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
      console.log(JSON.stringify({ game, ply, pits: s.pits, toMove: s.current, result, margin }));
      rows++;
    }
    game++;
  }
}
console.error(`${rows} positions from ${game} games`);
