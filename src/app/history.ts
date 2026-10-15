/**
 * Finished games, kept in this browser, and the player's own Elo rating against the bots.
 *
 * Each game stores the bot's rating as it was when the game was played (and which set of
 * ratings that was), so adding or retuning bots later never rewrites past results. The player's
 * rating is replayed from the saved games in order.
 *
 * A game counts toward the rating ("rated") only if it was one person against one bot, played to
 * the end under the standard rules, with no Undo or Hint and no change of opponent midway.
 */
import { type BotId, BOTS, isBotId, type Seat } from "../bots/bots.ts";
import { RATINGS, RATINGS_VERSION } from "../bots/ratings.ts";
import { DEFAULT_RULES, type Player, type Rules } from "../game/types.ts";

const KEY = "mancala.history.v1";
const MAX_GAMES = 500;
export const START_RATING = 1000;
const K = 32;

export interface SavedGame {
  /** When it finished (ISO time). */
  at: string;
  seats: { 1: Seat; 2: Seat };
  /** Each bot seat's rating at the time, and which ratings file that came from. */
  botElo: { 1?: number; 2?: number };
  ratingsVersion: string;
  rules: Rules;
  first: Player;
  score: [number, number];
  winner: Player | null;
  /** Every pit played, in order: enough to replay the game. */
  moves: number[];
  rated: boolean;
  /** Why it isn't rated, when it isn't. */
  unratedBecause?: string;
}

export function loadGames(): SavedGame[] {
  try {
    const games = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

function saveGames(games: SavedGame[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(games.slice(-MAX_GAMES)));
  } catch { /* storage full or unavailable: history lasts this visit */ }
}

export function clearGames(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

const isStandard = (r: Rules) =>
  r.seeds === DEFAULT_RULES.seeds && r.capture === DEFAULT_RULES.capture && r.clinch === DEFAULT_RULES.clinch;

/** The side a lone human played, or null if both or neither sides were people. */
export function humanSide(seats: { 1: Seat; 2: Seat }): Player | null {
  const h1 = seats[1] === "human", h2 = seats[2] === "human";
  return h1 === h2 ? null : h1 ? 1 : 2;
}

/** Builds and saves a finished game. `tainted` explains why it can't be rated (undo, hint…). */
export function recordGame(
  g: Omit<SavedGame, "at" | "botElo" | "ratingsVersion" | "rated" | "unratedBecause">,
  tainted: string | null,
): SavedGame {
  const botElo: SavedGame["botElo"] = {};
  for (const p of [1, 2] as const) {
    const seat = g.seats[p];
    if (seat !== "human") botElo[p] = RATINGS[seat]?.elo;
  }
  const human = humanSide(g.seats);
  const unratedBecause = human === null
    ? "not one person against a bot"
    : !isStandard(g.rules)
    ? "house rules"
    : tainted ?? undefined;
  const game: SavedGame = {
    ...g,
    at: new Date().toISOString(),
    botElo,
    ratingsVersion: RATINGS_VERSION,
    rated: !unratedBecause,
    unratedBecause,
  };
  saveGames([...loadGames(), game]);
  return game;
}

/** 0 to 1: how likely a player rated `a` is to beat one rated `b`. */
const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

export interface PlayerStats {
  rating: number;
  /** The player's rating after each rated game, oldest first (for the chart). */
  trend: number[];
  rated: number;
  played: number;
  /** Per bot: wins, losses and draws against it (any game with one person against that bot). */
  vs: Map<BotId, { w: number; l: number; d: number }>;
  /** Rating change from each game, by index into the saved games (rated games only). */
  change: Map<number, number>;
}

/** Replays the saved games to get the player's rating and record. */
export function playerStats(games: SavedGame[]): PlayerStats {
  let rating = START_RATING;
  const trend: number[] = [];
  const vs = new Map<BotId, { w: number; l: number; d: number }>();
  const change = new Map<number, number>();
  games.forEach((g, i) => {
    const me = humanSide(g.seats);
    if (me === null) return;
    const them = (me === 1 ? 2 : 1) as Player;
    const bot = g.seats[them];
    if (!isBotId(bot)) return;
    const result = g.winner === null ? 0.5 : g.winner === me ? 1 : 0;
    const rec = vs.get(bot) ?? { w: 0, l: 0, d: 0 };
    if (result === 1) rec.w++;
    else if (result === 0) rec.l++;
    else rec.d++;
    vs.set(bot, rec);
    const opp = g.botElo[them];
    if (!g.rated || opp === undefined) return;
    const delta = K * (result - expected(rating, opp));
    rating += delta;
    change.set(i, delta);
    trend.push(rating);
  });
  return { rating: Math.round(rating), trend, rated: trend.length, played: games.length, vs, change };
}

/** "Hard bot (DFS)" style name for a seat in the history. */
export const seatName = (seat: Seat): string =>
  seat === "human" ? "A person" : isBotId(seat) ? `${BOTS[seat].level} bot` : String(seat);
