import { assert, assertEquals } from "@std/assert";
import {
  DfsBot,
  FirstBot,
  GenerousBot,
  GreedyBot,
  LookaheadBot,
  MinimaxBot,
  PushoverBot,
  RandomBot,
} from "../src/bots/bots.ts";
import { search } from "../src/bots/search/minimax.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";
import { playMatch, seeded } from "../tools/match.ts";

const position = (pits: number[], current = P1): GameState => ({
  rules: { ...DEFAULT_RULES },
  pits,
  current,
  gameOver: false,
});

Deno.test("every bot only plays legal pits", () => {
  const bots = [
    new RandomBot(seeded(1)),
    new GenerousBot(seeded(3)),
    new PushoverBot(3),
    new GreedyBot(),
    new LookaheadBot(2, 3, seeded(2)),
    new DfsBot(),
    new MinimaxBot({ depth: 3 }),
  ];
  let g = newGame(DEFAULT_RULES, P1);
  for (let turn = 0; turn < 60 && !g.gameOver; turn++) {
    const move = bots[turn % bots.length].choose(g);
    assert(move !== null && validMoves(g).includes(move), `turn ${turn}: ${move}`);
    const r = playTurn(g, move);
    assert(!r.invalid);
    g = r.state;
  }
});

Deno.test("bots return null when there's no move", () => {
  const over = { ...newGame(DEFAULT_RULES, P1), gameOver: true };
  for (
    const bot of [new RandomBot(), new GreedyBot(), new LookaheadBot(), new DfsBot(), new MinimaxBot({ depth: 2 })]
  ) {
    assertEquals(bot.choose(over), null);
  }
});

Deno.test("generous turns the capture down", () => {
  //                  0  1  2  3  4  5  6   7  8  9 10 11 12 13  M1 M2
  const s = position([1, 0, 0, 0, 0, 0, 3, 1, 9, 1, 1, 1, 1, 1, 0, 0]);
  assertEquals(new GenerousBot().choose(s), 6); // pit 0 would capture 9; pit 6 banks only 1
});

Deno.test("greedy takes the capture", () => {
  //               0  1  2  3  4  5  6   7  8  9 10 11 12 13  M1 M2
  const s = position([1, 0, 0, 0, 0, 0, 3, 1, 9, 1, 1, 1, 1, 1, 0, 0]);
  assertEquals(new GreedyBot().choose(s), 0); // lands in empty pit 1, takes pit 8's 9 seeds
});

Deno.test("DFS chains a free turn into a capture; greedy grabs the capture now", () => {
  // Pit 0 captures pit 9 straight away (3 seeds). Pit 6 banks 1 and earns a free turn, after
  // which pit 0 still captures: 4 in all. Greedy sees only this turn; DFS follows the chain.
  //                  0  1  2  3  4  5  6   7  8  9 10 11 12 13  M1 M2
  const s = position([2, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 0, 0]);
  assertEquals(new GreedyBot().choose(s), 0);
  assertEquals(new DfsBot().choose(s), 6);
});

Deno.test("minimax searches no deeper than it's told", () => {
  const g = newGame(DEFAULT_RULES, P1);
  const r = search(g, { depth: 4 });
  assert(r.move !== null);
  // It can stop sooner if it finds a forced result first.
  assert(r.depth >= 1 && r.depth <= 4, `depth ${r.depth}`);
  assert(r.nodes > 0);
});

Deno.test("minimax stops on time", () => {
  const started = performance.now();
  const r = search(newGame(DEFAULT_RULES, P2), { timeMs: 150 });
  assert(performance.now() - started < 1500);
  assert(r.depth >= 1 && r.move !== null);
});

Deno.test("minimax beats random and greedy", () => {
  const minimax = new MinimaxBot({ depth: 5 });
  let wins = 0;
  for (let i = 0; i < 6; i++) {
    const first = i % 2 ? P1 : P2;
    if (playMatch(minimax, new RandomBot(seeded(i)), first).winner === P1) wins++;
    if (playMatch(minimax, new GreedyBot(), first).winner === P1) wins++;
  }
  assert(wins >= 10, `minimax won ${wins} of 12`);
});

Deno.test("pushover loses even to random", () => {
  let lost = 0;
  for (let i = 0; i < 6; i++) {
    if (playMatch(new PushoverBot(3), new RandomBot(seeded(40 + i)), i % 2 ? P1 : P2).winner === P2) lost++;
  }
  assert(lost >= 5, `pushover lost ${lost} of 6`);
});

Deno.test("first plays the leftmost pit from its own side", () => {
  //                  0  1  2  3  4  5  6   7  8  9 10 11 12 13  M1 M2
  const s = position([0, 0, 4, 1, 0, 0, 0, 2, 0, 3, 0, 0, 5, 0, 0, 0]);
  assertEquals(new FirstBot().choose(s), 2); // Player 1: lowest index
  assertEquals(new FirstBot().choose({ ...s, current: P2 }), 12); // Player 2: their left is pit 13
});
