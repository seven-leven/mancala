/** The two bots below Pushover: a loser's net (net.ts) and its logic written out (decompiled.ts). */
import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import { createBot, PushoverBot } from "../src/bots/bots.ts";
import { formulaScore, LOSER_RANKING_WEIGHTS, rankingScore } from "../src/bots/judges/decompiled.ts";
import { evaluate } from "../src/bots/judges/evaluate.ts";
import { LOSER_WEIGHTS } from "../src/bots/judges/loser-weights.ts";
import { encode, encodeFor, loserNetScore, ValueNet } from "../src/bots/judges/net.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";

const position = (pits: number[], current = P1): GameState => ({
  rules: { ...DEFAULT_RULES },
  pits,
  current,
  gameOver: false,
});

test("encodeFor sees the board from one side, and says whether it's that side's move", () => {
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const s = position([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 20, 23], P1);
  const mine = encodeFor(s, P1), theirs = encodeFor(s, P2);
  assertEquals([...mine.subarray(0, 16)], [...encode(s)], "the mover's view, as encode gives it");
  assertEquals([mine[16], theirs[16]], [1, 0]);
  assertEquals(theirs[0], 8 / 8, "Player 2's view starts with their own pits");
  assertEquals(theirs[14], 23 / 49, "and their own store first");
});

test("the loser's net scores a finished game as evaluate does, and anything else by its value", () => {
  const net = new ValueNet(LOSER_WEIGHTS);
  const score = loserNetScore(net);
  //                    0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const over = { ...position([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 68]), gameOver: true };
  assertEquals(score(over, P1), evaluate(over, P1));
  const open = newGame(DEFAULT_RULES, P1);
  assertEquals(score(open, P2), 100 * net.valueFor(open, P2));
  const v = net.valueFor(open, P1);
  assert(v > -1 && v < 1, String(v));
});

test("the decompiled formulas count a seed moved from their store to yours as two seeds of lead", () => {
  // Stores well under 40 and the pits unchanged, so only the store lead moves.
  //                    0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const base = position([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 20, 22]);
  const ahead = position([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 21, 21]);
  for (const score of [formulaScore(LOSER_RANKING_WEIGHTS), rankingScore]) {
    assertEquals(Math.round((score(ahead, P1) - score(base, P1)) * 1e9) / 1e9, 2);
    const over = { ...base, gameOver: true };
    assertEquals(score(over, P2), evaluate(over, P2));
  }
});

test("both losers play legal moves through whole games, from either side", () => {
  for (const id of ["learnedPushover", "decompiledPushover"] as const) {
    const bot = createBot(id);
    assert(bot instanceof PushoverBot);
    let s = newGame(DEFAULT_RULES, id === "learnedPushover" ? P1 : P2);
    for (let ply = 0; ply < 300 && !s.gameOver; ply++) {
      const move = bot.choose(s);
      assert(move !== null && validMoves(s).includes(move), `${id}, ply ${ply}: ${move}`);
      s = playTurn(s, move).state;
    }
    assert(s.gameOver, `${id}'s game finishes`);
  }
});
