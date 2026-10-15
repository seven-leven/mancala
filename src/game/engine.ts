/**
 * The rules, in one place. Everything else (the bots, the animation, the screen) asks this
 * module what happens; nothing re-implements sowing. playTurn() never changes its input: it
 * returns a new state plus an ordered event log, which the animation replays.
 */
import {
  DEFAULT_RULES,
  type GameState,
  M1,
  M2,
  P1,
  P1_PITS,
  P2,
  P2_PITS,
  type Player,
  type Rules,
  type TurnEvent,
  type TurnResult,
} from "./types.ts";

/** One lap of the board, in the order seeds travel. */
export const SOW_ORDER = [0, 1, 2, 3, 4, 5, 6, M1, 13, 12, 11, 10, 9, 8, 7, M2] as const;
/** The slot after each slot on that lap (an array, not a Map: it's looked up for every seed). */
const NEXT = new Int8Array(16);
SOW_ORDER.forEach((slot, i) => (NEXT[slot] = SOW_ORDER[(i + 1) % SOW_ORDER.length]));

/** A relay can't really go on forever (every lap banks a seed), but never trust a loop. */
const MAX_DROPS = 100_000;

export const other = (p: Player): Player => (p === P1 ? P2 : P1);
export const storeOf = (p: Player): number => (p === P1 ? M1 : M2);
export const pitsOf = (p: Player): readonly number[] => (p === P1 ? P1_PITS : P2_PITS);
export const isPit = (i: number): boolean => i >= 0 && i <= 13;
export const ownerOf = (pit: number): Player => (pit <= 6 ? P1 : P2);
/** The pit across the board (pit 0 faces pit 7, pit 6 faces pit 13). */
export const oppositeOf = (pit: number): number => (pit <= 6 ? pit + 7 : pit - 7);
export const totalSeeds = (rules: Rules): number => 14 * rules.seeds;

/**
 * A game at the start: `rules.seeds` in every pit, or the 14 pit counts in `layout` (pits 0–13,
 * which must hold all of `totalSeeds(rules)` between them). Stores start empty.
 */
export function newGame(
  rules: Rules = DEFAULT_RULES,
  first: Player = Math.random() < 0.5 ? P1 : P2,
  layout?: readonly number[],
): GameState {
  if (layout && (layout.length !== 14 || layout.reduce((a, b) => a + b, 0) !== totalSeeds(rules))) {
    throw new Error(`a layout needs 14 pits holding ${totalSeeds(rules)} seeds`);
  }
  const pits = layout ? [...layout, 0, 0] : new Array<number>(16).fill(rules.seeds);
  pits[M1] = 0;
  pits[M2] = 0;
  return { rules: { ...rules }, pits, current: first, gameOver: false };
}

export const cloneState = (s: GameState): GameState => ({ ...s, pits: [...s.pits] });

/** The pits `player` may play: their own, and not empty. */
export function validMoves(s: GameState, player: Player = s.current): number[] {
  if (s.gameOver) return [];
  return pitsOf(player).filter((i) => s.pits[i] > 0);
}

export const score = (s: GameState, p: Player): number => s.pits[storeOf(p)];

export function winnerOf(s: GameState): Player | null {
  const a = s.pits[M1], b = s.pits[M2];
  return a === b ? null : a > b ? P1 : P2;
}

/** What a turn did, besides the new position. */
interface TurnInfo {
  captured: number;
  relays: number;
}
type Log = ((e: TurnEvent) => void) | null;

/** turn()'s answer: a bit set, or INVALID. */
export const FREE_TURN = 1, GAME_OVER = 2, INVALID = -1;

const sideEmpty = (pits: readonly number[], p: Player) => {
  for (const i of pitsOf(p)) if (pits[i] !== 0) return false;
  return true;
};

/**
 * Plays the pit `start` for the player whose turn it is, changing `state` in place: the rules,
 * once, for both playTurn() and the bots' searches (which reuse boards instead of copying them).
 * Returns INVALID, or FREE_TURN and GAME_OVER bits. `log` receives the event log, if wanted.
 */
export function turn(state: GameState, start: number, log: Log = null, info: TurnInfo | null = null): number {
  const pits = state.pits;
  const player = state.current;
  if (state.gameOver || !isPit(start) || ownerOf(start) !== player || pits[start] === 0) return INVALID;

  const skip = storeOf(other(player));
  let drops = 0;

  // Pick up a pit and drop one seed in each pit after it, skipping the opponent's store.
  const sow = (from: number): number => {
    let hand = pits[from];
    pits[from] = 0;
    log?.({ type: "pickup", pit: from, count: hand });
    let pos = from;
    while (hand > 0 && drops++ < MAX_DROPS) {
      pos = NEXT[pos];
      if (pos === skip) continue;
      pits[pos]++;
      hand--;
      log?.({ type: "drop", pit: pos, count: pits[pos], inHand: hand });
    }
    return pos;
  };

  // Relay sowing: while the last seed lands in a pit that already had seeds, pick them all up
  // and keep going.
  let landing = sow(start);
  let relays = 0;
  while (isPit(landing) && pits[landing] > 1 && drops < MAX_DROPS) {
    landing = sow(landing);
    relays++;
  }

  // Free turn: the last seed landed in the player's own store.
  const freeTurn = landing === storeOf(player);

  // Capture: the last seed landed in an empty pit (on your own side, unless the rules say either
  // side). You bank everything in the pit opposite; the seed that landed stays where it is.
  let captured = 0;
  const canCapture = isPit(landing) && pits[landing] === 1 &&
    (state.rules.capture === "any" || ownerOf(landing) === player);
  if (!freeTurn && canCapture) {
    const opposite = oppositeOf(landing);
    if (pits[opposite] > 0) {
      captured = pits[opposite];
      pits[opposite] = 0;
      pits[storeOf(player)] += captured;
      log?.({
        type: "capture",
        landing,
        opposite,
        captured,
        store: storeOf(player),
        storeCount: pits[storeOf(player)],
      });
    }
  }

  // Game over: a side is empty, or (if the rules allow) a store holds more than half the seeds,
  // a lead the other player can't catch. Each side then banks what's left on it.
  const majority = Math.floor(totalSeeds(state.rules) / 2) + 1;
  const clinched = state.rules.clinch && (pits[M1] >= majority || pits[M2] >= majority);
  if (clinched || sideEmpty(pits, P1) || sideEmpty(pits, P2)) {
    let p1Remain = 0, p2Remain = 0;
    for (const i of P1_PITS) p1Remain += pits[i];
    for (const i of P2_PITS) p2Remain += pits[i];
    for (let i = 0; i <= 13; i++) pits[i] = 0;
    pits[M1] += p1Remain;
    pits[M2] += p2Remain;
    state.gameOver = true;
    log?.({ type: "sweep", p1Remain, p2Remain, m1: pits[M1], m2: pits[M2] });
  }

  if (!freeTurn && !state.gameOver) state.current = other(player);
  if (info) [info.captured, info.relays] = [captured, relays];
  return (freeTurn && !state.gameOver ? FREE_TURN : 0) | (state.gameOver ? GAME_OVER : 0);
}

/**
 * Plays the pit `start` for the player whose turn it is, on a copy: the input is never changed.
 * `record: false` skips the event log, for the bots.
 */
export function playTurn(input: GameState, start: number, { record = true } = {}): TurnResult {
  const state = cloneState(input);
  const player = state.current;
  const events: TurnEvent[] = [];
  const info: TurnInfo = { captured: 0, relays: 0 };
  const flags = turn(state, start, record ? (e) => events.push(e) : null, info);
  if (flags === INVALID) return { invalid: true, state };
  return {
    invalid: false,
    state,
    player,
    move: start,
    freeTurn: (flags & FREE_TURN) !== 0,
    captured: info.captured,
    relays: info.relays,
    gameOver: state.gameOver,
    winner: state.gameOver ? winnerOf(state) : null,
    events,
  };
}
