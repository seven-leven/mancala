/** The learned bot's value net (src/bots/judges/net.ts) and the bot built on it. */
import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import { createBot, DfsReplyBot } from "../src/bots/bots.ts";
import { evaluate, WIN } from "../src/bots/judges/evaluate.ts";
import { encode, netScore, ValueNet } from "../src/bots/judges/net.ts";
import { WEIGHTS } from "../src/bots/judges/weights.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";

const position = (pits: number[], current = P1): GameState => ({
  rules: { ...DEFAULT_RULES },
  pits,
  current,
  gameOver: false,
});

test("the net sees a position from the mover's side, whichever side that is", () => {
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const p1 = position([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 20, 23], P1);
  // The same position with the sides swapped, Player 2 to move.
  const p2 = position([8, 9, 0, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 23, 20], P2);
  assertEquals([...encode(p1)], [...encode(p2)]);
  assertEquals(encode(p1)[0], 1 / 8, "pits are scaled by 1/8");
  assertEquals(encode(p1)[14], 20 / 49, "stores by 1/49, the mover's first");
  const net = new ValueNet(WEIGHTS);
  assertEquals(net.value(p1), net.value(p2));
});

test("the net's value stays between -1 and 1", () => {
  const net = new ValueNet(WEIGHTS);
  let s = newGame(DEFAULT_RULES, P1);
  for (let ply = 0; ply < 40 && !s.gameOver; ply++) {
    const v = net.value(s);
    assert(v > -1 && v < 1, `ply ${ply}: ${v}`);
    s = playTurn(s, validMoves(s)[ply % validMoves(s).length]).state;
  }
});

test("netScore keeps a finished game's real result, and turns the net's value to the searching side", () => {
  const net = new ValueNet(WEIGHTS);
  const score = netScore(net);
  //                    0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const over = { ...position([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60, 38]), gameOver: true };
  assertEquals(score(over, P1), evaluate(over, P1));
  assert(score(over, P1) >= WIN);
  const open = newGame(DEFAULT_RULES, P1);
  assertEquals(score(open, P1), 100 * net.value(open));
  assertEquals(score(open, P2), -100 * net.value(open));
});

test("the learned bot plays legal moves through a whole game", () => {
  const bot = createBot("learned");
  assert(bot instanceof DfsReplyBot);
  let s = newGame(DEFAULT_RULES, P2);
  for (let ply = 0; ply < 200 && !s.gameOver; ply++) {
    const move = bot.choose(s);
    assert(move !== null && validMoves(s).includes(move), `ply ${ply}: ${move}`);
    s = playTurn(s, move).state;
  }
  assert(s.gameOver, "the game finishes");
});
