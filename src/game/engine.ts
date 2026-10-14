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
const NEXT = new Map<number, number>(SOW_ORDER.map((pit, i) => [pit, SOW_ORDER[(i + 1) % SOW_ORDER.length]]));

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

export function newGame(rules: Rules = DEFAULT_RULES, first: Player = Math.random() < 0.5 ? P1 : P2): GameState {
  const pits = new Array<number>(16).fill(rules.seeds);
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

/**
 * Plays the pit `start` for the player whose turn it is.
 * `record: false` skips the event log, for the bots' searches.
 */
export function playTurn(input: GameState, start: number, { record = true } = {}): TurnResult {
  const state = cloneState(input);
  const player = state.current;
  if (state.gameOver || !isPit(start) || ownerOf(start) !== player || state.pits[start] === 0) {
    return { invalid: true, state };
  }

  const events: TurnEvent[] = [];
  const log = (e: TurnEvent) => record && events.push(e);
  const skip = storeOf(other(player));
  let drops = 0;

  // Pick up a pit and drop one seed in each pit after it, skipping the opponent's store.
  const sow = (from: number): number => {
    let hand = state.pits[from];
    state.pits[from] = 0;
    log({ type: "pickup", pit: from, count: hand });
    let pos = from;
    while (hand > 0 && drops++ < MAX_DROPS) {
      pos = NEXT.get(pos)!;
      if (pos === skip) continue;
      state.pits[pos]++;
      hand--;
      log({ type: "drop", pit: pos, count: state.pits[pos], inHand: hand });
    }
    return pos;
  };

  // Relay sowing: while the last seed lands in a pit that already had seeds, pick them all up
  // and keep going.
  let landing = sow(start);
  let relays = 0;
  while (isPit(landing) && state.pits[landing] > 1 && drops < MAX_DROPS) {
    landing = sow(landing);
    relays++;
  }

  // Free turn: the last seed landed in the player's own store.
  const freeTurn = landing === storeOf(player);

  // Capture: the last seed landed in an empty pit (on your own side, unless the rules say either
  // side). You bank it and everything in the pit opposite.
  let captured = 0;
  const canCapture = isPit(landing) && state.pits[landing] === 1 &&
    (state.rules.capture === "any" || ownerOf(landing) === player);
  if (!freeTurn && canCapture) {
    const opposite = oppositeOf(landing);
    if (state.pits[opposite] > 0) {
      captured = state.pits[opposite] + 1;
      state.pits[opposite] = 0;
      state.pits[landing] = 0;
      state.pits[storeOf(player)] += captured;
      log({
        type: "capture",
        landing,
        opposite,
        captured,
        store: storeOf(player),
        storeCount: state.pits[storeOf(player)],
      });
    }
  }

  // Game over: a side is empty, or (if the rules allow) a store holds more than half the seeds,
  // a lead the other player can't catch. Each side then banks what's left on it.
  const majority = Math.floor(totalSeeds(state.rules) / 2) + 1;
  const clinched = state.rules.clinch && (state.pits[M1] >= majority || state.pits[M2] >= majority);
  const sideEmpty = (p: Player) => pitsOf(p).every((i) => state.pits[i] === 0);
  if (clinched || sideEmpty(P1) || sideEmpty(P2)) {
    const p1Remain = P1_PITS.reduce((n, i) => n + state.pits[i], 0);
    const p2Remain = P2_PITS.reduce((n, i) => n + state.pits[i], 0);
    for (let i = 0; i <= 13; i++) state.pits[i] = 0;
    state.pits[M1] += p1Remain;
    state.pits[M2] += p2Remain;
    state.gameOver = true;
    log({ type: "sweep", p1Remain, p2Remain, m1: state.pits[M1], m2: state.pits[M2] });
  }

  if (!freeTurn && !state.gameOver) state.current = other(player);

  return {
    invalid: false,
    state,
    player,
    move: start,
    freeTurn: freeTurn && !state.gameOver,
    captured,
    relays,
    gameOver: state.gameOver,
    winner: state.gameOver ? winnerOf(state) : null,
    events,
  };
}
