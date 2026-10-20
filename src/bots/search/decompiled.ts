/**
 * The learned net's logic, written out by hand: a weighted sum of readable pieces, fitted to the
 * net's preferences between positions reachable from the same one (tools/learn/ranking.ts). On the
 * same search as the net it plays about halfway between Minimax's evaluation and the net.
 *
 * Weights are in seeds of store lead, from the side choosing (`me`). Its strongest pieces: running
 * your side below 6 seeds (−17.7 a seed), empty pits of yours to land a capture in (+9.3 each), and
 * the clinch line (about ±8 a seed banked over 40). The seeds on each side and the free turns set up
 * overlap with the rest (seeds on board and stores always total 98), so their own weights mean little.
 */
import { evaluate, exposed, freeTurnsReady } from "./evaluate.ts";
import { other } from "../../game/engine.ts";
import type { GameState, Player } from "../../game/types.ts";

/** The winning net's logic, in the order the pieces are summed below. */
export const RANKING_WEIGHTS = {
  lead: 1,
  mySide: -1.38,
  theirSide: 1.02,
  myFreeTurns: 0.31,
  theirFreeTurns: 3.94,
  myExposed: 0.95,
  theirExposed: -1.95,
  myEmpty: 9.31,
  theirEmpty: -6.83,
  myOver40: 8.64,
  theirOver40: -7.66,
  myShort: -17.7,
  theirShort: 17.67,
  myNear: 0.81,
  theirNear: -1.76,
};

/**
 * The loser's net's logic (tools/learn/ranking.ts on its positions): close to the plain store lead,
 * with empty pits of yours, the clinch line and running short of seeds as small extras.
 */
export const LOSER_RANKING_WEIGHTS: typeof RANKING_WEIGHTS = {
  lead: 1,
  mySide: -0.16,
  theirSide: -0.18,
  myFreeTurns: -0.01,
  theirFreeTurns: 0.16,
  myExposed: 0.02,
  theirExposed: -0.05,
  myEmpty: 0.65,
  theirEmpty: 0.22,
  myOver40: 0.5,
  theirOver40: -0.34,
  myShort: -0.59,
  theirShort: 0.59,
  myNear: -0.04,
  theirNear: 0.01,
};

const offset = (p: Player) => (p === 1 ? 0 : 7);
const storeOf = (s: GameState, p: Player) => s.pits[p === 1 ? 14 : 15];
function side(s: GameState, p: Player): number {
  let n = 0;
  for (let i = 0, o = offset(p); i < 7; i++) n += s.pits[o + i];
  return n;
}
function empty(s: GameState, p: Player): number {
  let n = 0;
  for (let i = 0, o = offset(p); i < 7; i++) if (s.pits[o + i] === 0) n++;
  return n;
}
/** Seeds in the three pits nearest the store (pits 5–7, three or fewer moves from it). */
const near = (s: GameState, p: Player) => s.pits[offset(p) + 4] + s.pits[offset(p) + 5] + s.pits[offset(p) + 6];

/** A search's score for `me` from weights `w`: a finished game as `evaluate` scores it, anything else by the formula. */
export const formulaScore = (w: typeof RANKING_WEIGHTS) => (s: GameState, me: Player): number => {
  if (s.gameOver) return evaluate(s, me);
  const them = other(me);
  const mySide = side(s, me), theirSide = side(s, them);
  const mine = storeOf(s, me), theirs = storeOf(s, them);
  return w.lead * (mine - theirs) + w.mySide * mySide + w.theirSide * theirSide +
    w.myFreeTurns * freeTurnsReady(s, me) + w.theirFreeTurns * freeTurnsReady(s, them) +
    w.myExposed * exposed(s, me) + w.theirExposed * exposed(s, them) +
    w.myEmpty * empty(s, me) + w.theirEmpty * empty(s, them) +
    w.myOver40 * Math.max(0, mine - 40) + w.theirOver40 * Math.max(0, theirs - 40) +
    w.myShort * Math.max(0, 6 - mySide) + w.theirShort * Math.max(0, 6 - theirSide) +
    w.myNear * near(s, me) + w.theirNear * near(s, them);
};

/** The winning net's logic as a search score. */
export const rankingScore = formulaScore(RANKING_WEIGHTS);
