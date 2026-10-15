import { assert, assertEquals } from "@std/assert";
import { gamesToMgn, humanSide, playerStats, type SavedGame, seatName, START_RATING } from "../src/app/history.ts";
import { DEFAULT_RULES, P1, P2 } from "../src/game/types.ts";
import { newGame, playTurn } from "../src/game/engine.ts";
import { parseGames } from "../src/game/notation.ts";
import { GreedyBot } from "../src/bots/bots.ts";

/** A finished game: you (Player 1) against `bot` rated `elo`. */
function game(bot: SavedGame["seats"][2], elo: number, result: "win" | "loss" | "draw", rated = true): SavedGame {
  return {
    at: "2026-10-15T00:00:00.000Z",
    seats: { 1: "human", 2: bot },
    botElo: { 2: elo },
    ratingsVersion: "test",
    rules: { ...DEFAULT_RULES },
    first: 1,
    score: result === "win" ? [60, 38] : result === "loss" ? [38, 60] : [49, 49],
    winner: result === "win" ? 1 : result === "loss" ? 2 : null,
    moves: [],
    rated,
  };
}

Deno.test("no games: the starting rating", () => {
  const s = playerStats([]);
  assertEquals([s.rating, s.rated, s.played], [START_RATING, 0, 0]);
});

Deno.test("beating a much stronger bot gains nearly the full 32", () => {
  const s = playerStats([game("minimax", 1908, "win")]);
  assert(s.rating > START_RATING + 30, String(s.rating));
});

Deno.test("losing to a much weaker bot costs most of the 32", () => {
  const s = playerStats([game("pushover", 556, "loss")]);
  assert(s.rating < START_RATING - 25, String(s.rating));
});

Deno.test("an even draw changes nothing", () => {
  assertEquals(playerStats([game("random", START_RATING, "draw")]).rating, START_RATING);
});

Deno.test("unrated games count in the record, not the rating", () => {
  const s = playerStats([game("dfs", 1838, "win", false), game("dfs", 1838, "loss", false)]);
  assertEquals(s.rating, START_RATING);
  assertEquals(s.vs.get("dfs"), { w: 1, l: 1, d: 0 });
  assertEquals(s.rated, 0);
});

Deno.test("each game uses the bot's rating from when it was played", () => {
  // The same bot, re-rated between games: the old game keeps its old number.
  const before = playerStats([game("greedy", 1200, "win")]).rating;
  const after = playerStats([game("greedy", 1400, "win")]).rating;
  assert(after > before);
});

Deno.test("games against a bot made dormant since still count", () => {
  // Saved games keep the id they were played against; "first" is dormant now.
  const old = game("first" as SavedGame["seats"][2], 1012, "win");
  const s = playerStats([old]);
  assertEquals([s.rated, s.vs.get("first")?.w], [1, 1]);
  assert(s.rating > START_RATING);
  assertEquals(seatName("first"), "Casual bot");
});

Deno.test("only one person against a bot has a human side", () => {
  assertEquals(humanSide({ 1: "human", 2: "minimax" }), 1);
  assertEquals(humanSide({ 1: "dfs", 2: "human" }), 2);
  assertEquals(humanSide({ 1: "human", 2: "human" }), null);
  assertEquals(humanSide({ 1: "dfs", 2: "minimax" }), null);
});

Deno.test("saved games export as MGN that parses back to the same moves", () => {
  // Two real games, played by bots, saved the way the app saves them.
  const games = [P1, P2].map((first, k) => {
    let g = newGame(DEFAULT_RULES, first);
    const moves: number[] = [];
    const bot = new GreedyBot();
    while (!g.gameOver) {
      const m = bot.choose(g)!;
      moves.push(m);
      g = playTurn(g, m, { record: false }).state;
    }
    return {
      at: `2026-10-1${k}T12:00:00.000Z`,
      seats: { 1: "human", 2: "greedy" },
      botElo: { 2: 1320 },
      ratingsVersion: "2026-10-15",
      rules: { ...DEFAULT_RULES },
      first,
      score: [g.pits[14], g.pits[15]],
      winner: null,
      moves,
      rated: k === 0,
      unratedBecause: k === 0 ? undefined : "Undo used",
    } as SavedGame;
  });
  const text = gamesToMgn(games);
  const back = parseGames(text);
  assertEquals(back.map((g) => g.moves), games.map((g) => g.moves));
  assertEquals(back[0].tags.Date, "2026.10.10");
  assertEquals(back[1].tags.Rated, "no (Undo used)");
});
