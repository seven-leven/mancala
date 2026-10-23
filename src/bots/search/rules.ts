/**
 * The Rule list bot's rules: Intuition's policy net (policy.ts) decompiled into an ordered list of
 * if/then rules a person could follow at the board (lab/learn/rules.ts mined them). Each move is
 * described by a few facts; the first rule that some move passes picks among the moves that pass it.
 */
import { FREE_TURN, other, pitsOf, storeOf, validMoves, winnerOf } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import { Boards, playOn } from "./moves.ts";

/** What a person can see about a move: one move ahead, and the opponent's best answer. */
export interface MoveFacts {
  pit: number;
  /** 1 for the mover's first pit (furthest from their store) to 7 for the last. */
  place: number;
  /** It ends the game with the mover ahead. */
  wins: boolean;
  /** The last seed lands in the mover's store: they play again. */
  free: boolean;
  /** Seeds into the mover's store this move, captures included. */
  bank: number;
  /** The most the opponent can bank with their next move (0 if the mover plays again or the game ends). */
  give: number;
}

/** A rule: which moves pass it, then how to choose among them. */
export interface Rule {
  /** Only a move that ends the game with the mover ahead. */
  wins?: boolean;
  /** Only a move that earns a free turn. */
  free?: boolean;
  /** Only a move that banks at least this many seeds. */
  minBank?: number;
  /** Only a move after which the opponent can bank at most this many. */
  maxGive?: number;
  /** Only a move whose bank, less what it gives, is at least this. */
  minNet?: number;
  /**
   * Among the moves that pass: the one that banks most ("bank"), banks most less what it gives
   * ("net"), gives least ("give"), or sits nearest the store ("near") or furthest from it ("far").
   * Remaining ties go to the pit nearest the store.
   */
  pick: "bank" | "net" | "give" | "near" | "far";
}

/** The rules, in order: mined by lab/learn/rules.ts from Intuition's net. The last takes any move. */
export const RULES: readonly Rule[] = [
  { maxGive: 0, pick: "far" },
  { maxGive: 1, pick: "far" },
  { minBank: 6, pick: "near" },
  { minNet: 2, pick: "bank" },
  { maxGive: 2, pick: "far" },
  { minBank: 4, pick: "near" },
  { minBank: 1, maxGive: 4, pick: "net" },
  { pick: "far" },
];

/** Whether `f` passes `rule`'s conditions. */
export const passes = (rule: Rule, f: MoveFacts): boolean =>
  (!rule.wins || f.wins) && (!rule.free || f.free) && f.bank >= (rule.minBank ?? 0) &&
  f.give <= (rule.maxGive ?? Infinity) && f.bank - f.give >= (rule.minNet ?? -Infinity);

const PICKS: Record<Rule["pick"], (f: MoveFacts) => number> = {
  bank: (f) => f.bank,
  net: (f) => f.bank - f.give,
  give: (f) => -f.give,
  near: (f) => f.place,
  far: (f) => -f.place,
};

/** The move `rule` picks from `facts`, or null if no move passes it. */
export function pickBy(rule: Rule, facts: MoveFacts[]): number | null {
  let best: MoveFacts | null = null;
  const key = PICKS[rule.pick];
  for (const f of facts) {
    if (!passes(rule, f)) continue;
    if (!best || key(f) > key(best) || (key(f) === key(best) && f.place > best.place)) best = f;
  }
  return best ? best.pit : null;
}

/** The facts about every legal move in `s`, played on reused boards. */
export function factsOf(s: GameState, boards = new Boards()): MoveFacts[] {
  const me = s.current, them = other(me), pits = pitsOf(me);
  const after = boards.at(0, s), reply = boards.at(1, s);
  return validMoves(s).map((pit) => {
    const flags = playOn(after, s, pit);
    const bank = after.pits[storeOf(me)] - s.pits[storeOf(me)];
    let give = 0;
    if (!after.gameOver && after.current === them) {
      for (const r of validMoves(after)) {
        playOn(reply, after, r);
        give = Math.max(give, reply.pits[storeOf(them)] - after.pits[storeOf(them)]);
      }
    }
    return {
      pit,
      place: pits.indexOf(pit) + 1,
      wins: after.gameOver && winnerOf(after) === me,
      free: (flags & FREE_TURN) !== 0 && !after.gameOver,
      bank,
      give,
    };
  });
}

/** The move the first rule that applies picks; the last rule should apply to any move. */
export function followRules(rules: readonly Rule[], facts: MoveFacts[]): number | null {
  for (const rule of rules) {
    const pit = pickBy(rule, facts);
    if (pit !== null) return pit;
  }
  return null;
}
