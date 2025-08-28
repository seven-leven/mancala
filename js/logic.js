import { P1, P2, P1_PITS, P2_PITS, M1, M2 } from "./state.js";

// --- Game Logic Helpers & Constants ---

// The order of pits for sowing stones, forming a cycle for each player's turn.
const ORDER = [0, 1, 2, 3, 4, 5, 6, 14, 13, 12, 11, 10, 9, 8, 7, 15];
const NEXT = new Map(ORDER.map((v, i) => [v, ORDER[(i + 1) % ORDER.length]]));

// Helper functions that operate on pit indices or player numbers.
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
  return null; // Not a small pit
};

/**
 * Calculates the list of valid moves for a given player from the current state.
 * A move is valid if the player's pit is not empty.
 * @param {MancalaState} state The current game state.
 * @param {number} player The player (P1 or P2).
 * @returns {number[]} An array of pit indices that are valid moves.
 */
export function getValidMoves(state, player) {
  const playerPits = player === P1 ? P1_PITS : P2_PITS;
  return playerPits.filter((i) => state.pits[i] > 0);
}

/**
 * Simulates a single turn of Mancala without UI delays or animations.
 * This is a pure function: it takes a state and returns a result without side effects on the original state.
 * @param {MancalaState} initialState The state of the game before the move.
 * @param {number} startIndex The index of the pit to play from.
 * @returns {object} An object containing the result of the turn:
 *  - {MancalaState} newState: The state of the game after the move.
 *  - {boolean} invalid: True if the move was illegal.
 *  - {boolean} freeTurn: True if the player gets another turn.
 *  - {boolean} gameOver: True if the game ended as a result of this move.
 *  - {number|null} winner: The winning player if the game is over.
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

  // 2. --- Sowing logic (The core move) ---
  const _sow = (startPit) => {
    let inHand = state.pits[startPit];
    state.pits[startPit] = 0;
    let currentPos = NEXT.get(startPit);

    while (inHand > 0) {
      // Skip opponent's mancala
      if (currentPos === oppStoreOf(player)) {
        currentPos = NEXT.get(currentPos);
        continue;
      }
      state.pits[currentPos]++;
      inHand--;
      if (inHand > 0) {
        currentPos = NEXT.get(currentPos);
      }
    }
    return currentPos; // Return the landing pit
  };

  // Perform the sowing, which can chain if landing in a non-empty pit
  let landingPit = _sow(startIndex);
  while (isSmallPit(landingPit) && state.pits[landingPit] > 1) {
    landingPit = _sow(landingPit);
  }

  let freeTurn = false;

  // 3. --- Check for a Free Turn ---
  if (landingPit === storeOf(player)) {
    freeTurn = true;
  }
  // 4. --- Check for a Capture ---
  else if (
    isOwnSmallPit(player, landingPit) &&
    state.pits[landingPit] === 1
  ) {
    const oppositePit = oppositeOf(landingPit);
    const capturedStones = state.pits[oppositePit];
    if (capturedStones > 0) {
      state.pits[oppositePit] = 0;
      state.pits[storeOf(player)] += capturedStones + 1; // +1 for the landing stone
      state.pits[landingPit] = 0;
    }
  }

  // 5. --- Check for Game Over condition ---
  const p1PitsEmpty = P1_PITS.every((i) => state.pits[i] === 0);
  const p2PitsEmpty = P2_PITS.every((i) => state.pits[i] === 0);

  if (p1PitsEmpty || p2PitsEmpty) {
    // Sweep remaining stones into their respective mancalas
    const p1Remain = P1_PITS.reduce((a, i) => a + state.pits[i], 0);
    const p2Remain = P2_PITS.reduce((a, i) => a + state.pits[i], 0);
    for (const i of P1_PITS) state.pits[i] = 0;
    for (const i of P2_PITS) state.pits[i] = 0;
    state.pits[M1] += p1Remain;
    state.pits[M2] += p2Remain;

    state.gameOver = true;
  }

  // 6. --- Determine the Winner ---
  let winner = null;
  if (state.gameOver) {
    if (state.pits[M1] > state.pits[M2]) winner = P1;
    else if (state.pits[M2] > state.pits[M1]) winner = P2;
    // if equal, winner remains null, indicating a draw
  }

  // 7. --- Switch the current player if the turn is over ---
  if (!freeTurn && !state.gameOver) {
    state.current = player === P1 ? P2 : P1;
  }

  return {
    newState: state,
    invalid: false,
    freeTurn,
    gameOver: state.gameOver,
    winner,
  };
}

// General utility function for adding delays, useful for animations in the UI layer.
export const wait = (ms) => new Promise((res) => setTimeout(res, ms));