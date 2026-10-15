import { assert, assertEquals, assertThrows } from "@std/assert";
import { GreedyBot, LookaheadBot, MinimaxBot, RandomBot } from "../src/bots/bots.ts";
import { newGame, playTurn } from "../src/game/engine.ts";
import { formatGame, type GameRecord, parseGame, parseGames, pitName, replay } from "../src/game/notation.ts";
import { DEFAULT_RULES, P1, P2, type Player } from "../src/game/types.ts";
import { seeded } from "../tools/match.ts";

/** A whole game between two bots, as a record. */
function played(first: Player, seed: number, layout?: number[]): GameRecord {
  const bots = { [P1]: new LookaheadBot(2, 3, seeded(seed)), [P2]: new RandomBot(seeded(seed + 1)) };
  let g = newGame(DEFAULT_RULES, first, layout);
  const moves: number[] = [];
  while (!g.gameOver) {
    const move = bots[g.current].choose(g)!;
    moves.push(move);
    g = playTurn(g, move, { record: false }).state;
  }
  return { tags: { P1: "lookahead", P2: "random" }, rules: { ...DEFAULT_RULES }, first, layout, moves };
}

Deno.test("pits are named 1–7 from the mover's own left", () => {
  assertEquals([0, 6, 13, 7].map(pitName), [1, 7, 1, 7]);
});

Deno.test("a game survives formatting and parsing, move for move", () => {
  for (const [first, seed] of [[P1, 1], [P2, 2], [P1, 3]] as const) {
    const game = played(first, seed);
    const text = formatGame(game);
    const back = parseGame(text);
    assertEquals(back.moves, game.moves);
    assertEquals(back.first, first);
    assertEquals(back.tags.P1, "lookahead");
    assertEquals(formatGame(back), text);
  }
});

Deno.test("the text marks free turns and captures, and ends with the score", () => {
  const text = formatGame(played(P1, 4));
  const end = replay(parseGame(text)).states.at(-1)!;
  assert(text.includes(`[Result "${end.pits[14]}-${end.pits[15]}"]`));
  assert(text.trimEnd().endsWith(`${end.pits[14]}-${end.pits[15]}`));
  assert(/\d\+/.test(text), "a free turn somewhere");
  assert(/^1\. /m.test(text));
});

Deno.test("a pit 1 opening: free turn, written 1+", () => {
  const text = formatGame({ tags: {}, rules: { ...DEFAULT_RULES }, first: P1, moves: [0] });
  assert(/\n1\. 1\+\n$/.test(text), text);
});

Deno.test("a start board other than the standard one is kept", () => {
  const layout = [3, 4, 5, 6, 7, 10, 14, 14, 10, 7, 6, 5, 4, 3];
  const game = played(P2, 5, layout);
  const text = formatGame(game);
  assert(text.includes(`[Start "3 4 5 6 7 10 14 | 3 4 5 6 7 10 14"]`), text);
  assertEquals(parseGame(text).layout, layout);
});

Deno.test("wrong marks or illegal moves are refused", () => {
  assertThrows(() => parseGame(`[First "1"]\n\n1. 1`), Error, "marks"); // pit 1 is a free turn: 1+
  assertThrows(() => parseGame(`[First "1"]\n\n1. 1+ 1`), Error, "legal"); // pit 1 is empty now
  assertThrows(() => parseGame(`[First "1"]\n\n1. 9`), Error, "isn't a move");
});

Deno.test("several games in one file", () => {
  const games = [played(P1, 6), played(P2, 7)];
  const text = games.map(formatGame).join("\n");
  assertEquals(parseGames(text).map((g) => g.moves), games.map((g) => g.moves));
});

Deno.test("search bots' games format too", () => {
  const a = new MinimaxBot({ depth: 2 }), b = new GreedyBot();
  let g = newGame(DEFAULT_RULES, P2);
  const moves: number[] = [];
  for (let k = 0; k < 400 && !g.gameOver; k++) {
    const m = (g.current === P1 ? a : b).choose(g)!;
    moves.push(m);
    g = playTurn(g, m, { record: false }).state;
  }
  const game = { tags: {}, rules: { ...DEFAULT_RULES }, first: P2, moves } satisfies GameRecord;
  assertEquals(parseGame(formatGame(game)).moves, moves);
});
