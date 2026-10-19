import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import {
  BOTS,
  createBot,
  DfsBot,
  FirstBot,
  GenerousBot,
  GreedyBot,
  isBotId,
  LookaheadBot,
  MinimaxBot,
  MixedBot,
  PushoverBot,
  RandomBot,
  TurtleBot,
  TwoMoveBot,
} from "../src/bots/bots.ts";
import { MonteCarloBot } from "../src/bots/players/montecarlo.ts";
import { exposed, freeTurnsReady, lead, mobility, threats } from "../src/bots/search/evaluate.ts";
import { search } from "../src/bots/search/minimax.ts";
import { Boards, playOn } from "../src/bots/search/moves.ts";
import { FREE_TURN, newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";
import { seeded } from "../tools/match.ts";

const position = (pits: number[], current = P1): GameState => ({
  rules: { ...DEFAULT_RULES },
  pits,
  current,
  gameOver: false,
});

test("every bot only plays legal pits", () => {
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

test("bots return null when there's no move", () => {
  const over = { ...newGame(DEFAULT_RULES, P1), gameOver: true };
  for (
    const bot of [
      new RandomBot(),
      new GreedyBot(),
      new LookaheadBot(),
      new DfsBot(),
      new MinimaxBot({ depth: 2 }),
      new FirstBot(),
    ]
  ) {
    assertEquals(bot.choose(over), null);
  }
});

test("generous turns the capture down", () => {
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13 M1 M2
  const s = position([1, 0, 0, 0, 0, 0, 3, 1, 9, 1, 1, 1, 1, 1, 0, 0]);
  assertEquals(new GenerousBot().choose(s), 6); // pit 0 would capture 9; pit 6 banks only 1
});

test("greedy takes the capture", () => {
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13 M1 M2
  const s = position([1, 0, 0, 0, 0, 0, 3, 1, 9, 1, 1, 1, 1, 1, 0, 0]);
  assertEquals(new GreedyBot().choose(s), 0); // lands in empty pit 1, takes pit 8's 9 seeds
});

test("DFS chains a free turn into a capture; greedy grabs the capture now", () => {
  // Pit 0 captures pit 9 straight away (3 seeds). Pit 6 banks 1 and earns a free turn, after
  // which pit 0 still captures: 4 in all. Greedy sees only this turn; DFS follows the chain.
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13 M1 M2
  const s = position([2, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 0, 0]);
  assertEquals(new GreedyBot().choose(s), 0);
  assertEquals(new DfsBot().choose(s), 6);
});

test("minimax searches no deeper than it's told", () => {
  const g = newGame(DEFAULT_RULES, P1);
  const r = search(g, { depth: 4 });
  assert(r.move !== null);
  // It can stop sooner if it finds a forced result first.
  assert(r.depth >= 1 && r.depth <= 4, `depth ${r.depth}`);
  assert(r.nodes > 0);
});

test("minimax stops on time", () => {
  const started = performance.now();
  const r = search(newGame(DEFAULT_RULES, P2), { timeMs: 150 });
  // Loosely: it stopped, with a legal move. How deep it got depends on the machine (and on coverage).
  assert(performance.now() - started < 1500);
  assert(validMoves(newGame(DEFAULT_RULES, P2)).includes(r.move!));
});

test("first plays the leftmost pit from its own side", () => {
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13 M1 M2
  const s = position([0, 0, 4, 1, 0, 0, 0, 2, 0, 3, 0, 0, 5, 0, 0, 0]);
  assertEquals(new FirstBot().choose(s), 2); // Player 1: lowest index
  assertEquals(new FirstBot().choose({ ...s, current: P2 }), 12); // Player 2: their left is pit 13
});

test("every bot in BOTS plays legal pits, in both modes, from either side", () => {
  for (const id of Object.keys(BOTS)) {
    if (!isBotId(id)) continue;
    for (const mode of ["play", "rate"] as const) {
      const bot = createBot(id, { rng: seeded(9), mode, timeMs: 20 });
      let g = newGame(DEFAULT_RULES, P2);
      for (let turn = 0; turn < 30 && !g.gameOver; turn++) {
        const move = bot.choose(g);
        assert(move !== null && validMoves(g).includes(move), `${id} (${mode}), turn ${turn}: ${move}`);
        g = playTurn(g, move, { record: false }).state;
      }
      assertEquals(bot.choose({ ...g, gameOver: true }), null, `${id} with no moves`);
    }
  }
});

test("exposed counts seeds in pits facing an empty pit", () => {
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13 M1 M2
  const s = position([4, 2, 0, 5, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0]);
  assertEquals(exposed(s, P1), 4); // pit 0 faces empty pit 7; pit 3 faces pit 10, which has a seed
  assertEquals(exposed(s, P2), 3); // pits 9, 11 and 12 (a seed each) face empty pits 2, 4 and 5
});

test("turtle gives up a seed to keep a loaded pit safe; greedy takes it", () => {
  //                  0  1  2  3  4  5  6   7  8  9 10 11 12 13  M1  M2
  const s = position([1, 6, 7, 0, 7, 1, 0, 13, 0, 3, 1, 0, 0, 2, 30, 27]);
  assertEquals(new GreedyBot().choose(s), 5); // banks 2, but leaves 14 seeds open to capture
  assertEquals(new TurtleBot(0.5, seeded(1)).choose(s), 4); // banks 1 and leaves nothing open
});

test("mixed: q = 1 is its main bot; q = 0 is random", () => {
  const g = newGame(DEFAULT_RULES, P1);
  assertEquals(new MixedBot(new FirstBot(), 1, seeded(1)).choose(g), 0);
  const picks = new Set<number | null>();
  const mixed = new MixedBot(new FirstBot(), 0, seeded(2));
  for (let k = 0; k < 50; k++) picks.add(mixed.choose(g));
  assert(picks.size > 3, `random picks: ${[...picks]}`);
});

test("scoring pieces: free turns set up, threats, mobility", () => {
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13 M1 M2
  const s = position([7, 0, 0, 0, 0, 0, 1, 1, 4, 0, 0, 0, 0, 2, 0, 0]);
  assertEquals(freeTurnsReady(s, P1), 2); // pit 0 (7 seeds, 7 from the store) and pit 6 (1 seed, 1 away)
  assertEquals(freeTurnsReady(s, P2), 1); // pit 7: 1 seed, 1 away; pit 13 needs 7
  assertEquals(threats(s, P1), 4); // of the empty pits 1–5, only pit 1 faces seeds (pit 8, 4)
  assertEquals(mobility(s, P1), 2);
  assertEquals(mobility(s, P2), 3);
});

test("the two-move bot sees replies, so it sometimes plays differently from Greedy", () => {
  let found = false;
  const rng = seeded(4);
  for (let game = 0; game < 40 && !found; game++) {
    let g = newGame(DEFAULT_RULES, P1);
    for (let k = 0; k < 30 && !g.gameOver; k++) {
      const a = new GreedyBot().choose(g), b = new TwoMoveBot(lead).choose(g);
      if (a !== b) found = true;
      g = playTurn(g, new RandomBot(rng).choose(g)!, { record: false }).state;
    }
  }
  assert(found, "the two-move bot should sometimes disagree with Greedy");
});

test("search bots say what they saw, for the move log", () => {
  // Player 1 has 49 banked, and either move makes 50 of 98, a clinched majority: pit 6 sows into the
  // store, and pit 0 lands in empty pit 1 and captures pit 8's seed.
  //                    0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const win = position([1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 49, 41]);
  const minimax = new MinimaxBot({ depth: 3 });
  assert([0, 6].includes(minimax.choose(win)!));
  assertEquals(minimax.note(), "sees a forced win");

  const opening = newGame(DEFAULT_RULES, P1);
  minimax.choose(opening);
  assert(
    /^(saw \d+ moves? ahead, [+-]?\d+|sees a forced (win|loss))$/.test(minimax.note() ?? ""),
    minimax.note() ?? "",
  );

  const lookahead = new LookaheadBot(2, 3, seeded(5));
  lookahead.choose(opening);
  assert(/^saw \d+ moves? ahead/.test(lookahead.note() ?? ""), lookahead.note() ?? "");

  // One legal move: nothing to search, so nothing to say.
  //                       0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const forced = position([0, 0, 0, 0, 0, 0, 3, 5, 5, 5, 5, 5, 5, 5, 30, 30]);
  assertEquals(minimax.choose(forced), 6);
  assertEquals(minimax.note(), null);
  assertEquals(new MinimaxBot().note(), null, "before any move there's no note");

  // The winning board with Player 2 to move: whatever it plays, Player 1 still reaches 50.
  minimax.choose({ ...win, current: P2 });
  assertEquals(minimax.note(), "sees a forced loss");

  // One move ahead, and behind: "move", not "moves", and no plus sign.
  //                                         0  1  2  3  4  5  6   7   8   9  10  11  12  13
  const behind = newGame(DEFAULT_RULES, P1, [2, 2, 2, 2, 2, 2, 2, 12, 12, 12, 12, 12, 12, 12]);
  const shallow = new LookaheadBot(1, 0, () => 0);
  shallow.choose(behind);
  assertEquals(shallow.note(), "saw 1 move ahead, -5");
});

test("createBot makes dormant bots too, and fills in what it isn't told", () => {
  assert(createBot("first") instanceof FirstBot);
  assertEquals(createBot("first").choose(newGame(DEFAULT_RULES, P1)), 0);
  // Grandmaster: depth 10 when rated, twice Minimax's time in the game.
  assert(createBot("grandmaster", { mode: "rate" }) instanceof MinimaxBot);
  assert(createBot("grandmaster") instanceof MinimaxBot);
  // No context: Math.random and the game's time budget.
  assert(validMoves(newGame(DEFAULT_RULES, P1)).includes(createBot("random").choose(newGame(DEFAULT_RULES, P1))!));
});

test("playOn plays a move on a reused board exactly as playTurn does, and Boards keeps one per depth", () => {
  const boards = new Boards();
  const start = newGame(DEFAULT_RULES, P1);
  const board = boards.at(0, start);
  assert(boards.at(0, start) === board, "the same board again for the same depth and rules");
  assert(boards.at(1, start) !== board, "another depth, another board");
  // A few moves in a row, each from the position after the last, against the engine's own copy.
  let g = start;
  for (const move of [3, 9, 0, 12]) {
    const flags = playOn(board, g, move);
    const r = playTurn(g, move, { record: false });
    assert(!r.invalid);
    assertEquals(board.pits, r.state.pits);
    assertEquals([board.current, board.gameOver, (flags & FREE_TURN) !== 0], [
      r.state.current,
      r.state.gameOver,
      r.freeTurn,
    ]);
    g = r.state;
  }
  // New rules (house rules, a new game): a new board for them.
  const house = newGame({ ...DEFAULT_RULES, seeds: 5 }, P1);
  assert(boards.at(0, house) !== board && boards.at(0, house).rules === house.rules);
});

test("monte carlo stops after its playouts, or its time, and says how it did", () => {
  const start = newGame(DEFAULT_RULES, P1);
  assertEquals(new MonteCarloBot({ playouts: 5 }).note(), null, "before any move there's no note");
  const fixed = new MonteCarloBot({ playouts: 50 }, seeded(1));
  assert(validMoves(start).includes(fixed.choose(start)!));
  assert(/^played 50 random games, won \d+%$/.test(fixed.note() ?? ""), fixed.note() ?? "");
  // Out of time at once: it still plays one game, so it always has a move to give.
  const rushed = new MonteCarloBot({ timeMs: 0 }, seeded(2));
  assert(validMoves(start).includes(rushed.choose(start)!));
  assert(/^played 1 random game, won \d+%$/.test(rushed.note() ?? ""), rushed.note() ?? "");
});

test("monte carlo plays a lone move without searching, and nothing when there's no move", () => {
  // Player 1 has one pit with seeds left.
  //                    0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const forced = position([0, 0, 0, 0, 0, 0, 3, 5, 5, 5, 5, 5, 5, 5, 30, 30]);
  const bot = new MonteCarloBot({ playouts: 20 }, seeded(3));
  assertEquals(bot.choose(forced), 6);
  assertEquals(bot.note(), null);
  assertEquals(bot.choose({ ...forced, gameOver: true }), null);
});

test("monte carlo takes the move that wins on the spot", () => {
  // Player 1 has 49 banked. Pit 6 sows its seed into the store: 50 of 98, a clinched majority, and
  // the game is over. Pit 1 keeps it going, against a side with every other seed. Many tries end
  // on the finished game, which the search must keep scoring as a win.
  //                    0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const win = position([0, 1, 0, 0, 0, 0, 1, 6, 6, 6, 6, 6, 6, 6, 49, 5]);
  const bot = new MonteCarloBot({ playouts: 300 }, seeded(4));
  assertEquals(bot.choose(win), 6);
  assertEquals(bot.note(), "played 300 random games, won 100%");
});

test("createBot makes monte carlo with a fixed number of playouts when rated, a 10 ms clock in the game", () => {
  const start = newGame(DEFAULT_RULES, P1);
  const rated = createBot("montecarlo", { mode: "rate", rng: seeded(5) });
  rated.choose(start);
  const note = rated.note?.() ?? "";
  assert(note.startsWith("played 2000 random games"), note);
  const played = createBot("montecarlo", { rng: seeded(6) });
  assert(validMoves(start).includes(played.choose(start)!));
});
