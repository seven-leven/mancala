import { M1, M2, P1, P1_PITS, P2, P2_PITS } from "./state.js";

// --- Game logic helpers & constants ---

// The order of pits for sowing stones, forming one full lap of the board.
const ORDER = [0, 1, 2, 3, 4, 5, 6, 14, 13, 12, 11, 10, 9, 8, 7, 15];
const NEXT = new Map(ORDER.map((v, i) => [v, ORDER[(i + 1) % ORDER.length]]));

// Helpers that operate on pit indices or player numbers.
export const isSmallPit = (i) => i >= 0 && i <= 13;
export const storeOf = (p) => (p === P1 ? M1 : M2);
export const oppStoreOf = (p) => (p === P1 ? M2 : M1);
export const isOwnSmallPit = (player, i) => {
  if (!isSmallPit(i)) return false;
  const playerPits = player === P1 ? P1_PITS : P2_PITS;
  return playerPits.includes(i);
};
export const oppositeOf = (i) => {
  if (i >= 0 && i <= 6) return i + 7;
  if (i >= 7 && i <= 13) return i - 7;
  return null; // Not a small pit.
};

/**
 * Calculates the list of valid moves for a given player from the current state.
 * A move is valid if the player owns the pit and it is not empty.
 * @param {MancalaState} state The current game state.
 * @param {number} player The player (P1 or P2).
 * @returns {number[]} An array of pit indices that are valid moves.
 */
export function getValidMoves(state, player) {
  const playerPits = player === P1 ? P1_PITS : P2_PITS;
  return playerPits.filter((i) => state.pits[i] > 0);
}

/**
 * Simulates a single turn of Mancala. This is the single source of truth for
 * the rules — the UI never re-implements sowing; it just replays the `events`
 * this function records (see animation-handler.js).
 *
 * Pure: it clones the input state and never mutates it.
 *
 * @param {MancalaState} initialState The state before the move.
 * @param {number} startIndex The index of the pit to play from.
 * @returns {object} The result of the turn:
 *  - {MancalaState} newState: The state after the move.
 *  - {boolean} invalid: True if the move was illegal (other fields are absent).
 *  - {boolean} freeTurn: True if the player earns another turn.
 *  - {boolean} gameOver: True if the game ended on this move.
 *  - {number|null} winner: The winning player, or null for a draw / ongoing game.
 *  - {object[]} events: An ordered log of what happened, for the animator.
 */
export function playTurn(initialState, startIndex) {
  const state = initialState.clone();
  const player = state.current;

  // 1. --- Validate the move ---
  if (
    state.gameOver ||
    !isOwnSmallPit(player, startIndex) ||
    state.pits[startIndex] === 0
  ) {
    return { newState: state, invalid: true };
  }

  const events = [];

  // 2. --- Sowing (the core move) ---
  // Picks up a pit and drops one stone in each following pit, skipping the
  // opponent's store. Records a `pickup` then one `drop` per stone.
  const sow = (startPit) => {
    let inHand = state.pits[startPit];
    state.pits[startPit] = 0;
    events.push({ type: "pickup", pit: startPit, count: inHand });

    let pos = NEXT.get(startPit);
    while (inHand > 0) {
      if (pos === oppStoreOf(player)) {
        pos = NEXT.get(pos);
        continue;
      }
      state.pits[pos]++;
      inHand--;
      events.push({ type: "drop", pit: pos, count: state.pits[pos], inHand });
      if (inHand > 0) pos = NEXT.get(pos);
    }
    return pos; // The landing pit.
  };

  // Perform the sowing, which chains (relay sow) if the last stone lands in a
  // non-empty small pit.
  let landingPit = sow(startIndex);
  while (isSmallPit(landingPit) && state.pits[landingPit] > 1) {
    landingPit = sow(landingPit);
  }

  let freeTurn = false;

  // 3. --- Free turn: last stone landed in the player's own store ---
  if (landingPit === storeOf(player)) {
    freeTurn = true;
  } // 4. --- Capture: last stone landed in an own, previously empty pit ---
  else if (isOwnSmallPit(player, landingPit) && state.pits[landingPit] === 1) {
    const oppositePit = oppositeOf(landingPit);
    const capturedStones = state.pits[oppositePit];
    if (capturedStones > 0) {
      state.pits[oppositePit] = 0;
      state.pits[landingPit] = 0;
      state.pits[storeOf(player)] += capturedStones + 1; // +1 for the landing stone.
      events.push({
        type: "capture",
        landing: landingPit,
        opposite: oppositePit,
        captured: capturedStones + 1,
        store: storeOf(player),
        storeCount: state.pits[storeOf(player)],
      });
    }
  }

  // 5. --- Game over ---
  // Ends when a side empties, or when a store passes half the stones (a
  // majority the opponent can no longer catch — 50 of 98 by default).
  const total = 14 * state.initialStones;
  const majority = Math.floor(total / 2) + 1;
  const clinched = state.pits[M1] >= majority || state.pits[M2] >= majority;
  const p1PitsEmpty = P1_PITS.every((i) => state.pits[i] === 0);
  const p2PitsEmpty = P2_PITS.every((i) => state.pits[i] === 0);

  if (clinched || p1PitsEmpty || p2PitsEmpty) {
    // Sweep each side's remaining stones into its own store.
    const p1Remain = P1_PITS.reduce((a, i) => a + state.pits[i], 0);
    const p2Remain = P2_PITS.reduce((a, i) => a + state.pits[i], 0);
    for (const i of P1_PITS) state.pits[i] = 0;
    for (const i of P2_PITS) state.pits[i] = 0;
    state.pits[M1] += p1Remain;
    state.pits[M2] += p2Remain;
    state.gameOver = true;
    events.push({
      type: "sweep",
      p1Remain,
      p2Remain,
      m1: state.pits[M1],
      m2: state.pits[M2],
    });
  }

  // 6. --- Determine the winner ---
  let winner = null;
  if (state.gameOver) {
    if (state.pits[M1] > state.pits[M2]) winner = P1;
    else if (state.pits[M2] > state.pits[M1]) winner = P2;
    // Equal scores leave winner null, i.e. a draw.
  }

  // 7. --- Hand the turn to the other player unless a free turn was earned ---
  if (!freeTurn && !state.gameOver) {
    state.current = player === P1 ? P2 : P1;
  }

  return { newState: state, invalid: false, freeTurn, gameOver: state.gameOver, winner, events };
}

// General utility for delays, used by the animation layer.
export const wait = (ms) => new Promise((res) => setTimeout(res, ms));
