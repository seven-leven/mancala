// --- Constants defining the board and players ---
export const P1 = 1;
export const P2 = 2;

export const P1_PITS = [0, 1, 2, 3, 4, 5, 6];
export const P2_PITS = [7, 8, 9, 10, 11, 12, 13];

// Mancala stores (large pits) are indexed separately
export const M1 = 14;
export const M2 = 15;

/**
 * Represents the state of the Mancala game at any point in time.
 * This class holds only the data and methods to manipulate that data directly (clone, reset).
 * It does not contain any game logic (how to play a turn, check for game over, etc.).
 */
export class MancalaState {
  constructor(stonesPerPit = 7) {
    this.initialStones = stonesPerPit;
    this.reset();
  }

  /**
   * Resets the game state to the initial configuration.
   */
  reset() {
    // Array holds all pits, including small pits and mancalas
    this.pits = new Array(16).fill(0);
    for (let i = 0; i < 14; i++) {
      this.pits[i] = this.initialStones;
    }
    // Mancalas start empty
    this.pits[M1] = 0;
    this.pits[M2] = 0;

    // Randomly assign the starting player
    this.current = Math.random() < 0.5 ? P1 : P2;
    this.gameOver = false;
  }

  /**
   * Creates a deep copy of the current game state.
   * Useful for simulations (e.g., in an AI).
   * @returns {MancalaState} A new MancalaState instance with the same properties.
   */
  clone() {
    const newState = new MancalaState(this.initialStones);
    newState.pits = [...this.pits];
    newState.current = this.current;
    newState.gameOver = this.gameOver;
    return newState;
  }
}
