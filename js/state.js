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
 * This class holds only the data and the methods to manipulate that data
 * directly (reset, clone, copyFrom). It contains no game logic — how to play a
 * turn, detect captures, or decide a winner lives entirely in logic.js.
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
    // Array holds all pits, including small pits and mancalas.
    this.pits = new Array(16).fill(0);
    for (let i = 0; i < 14; i++) {
      this.pits[i] = this.initialStones;
    }
    // Mancalas start empty.
    this.pits[M1] = 0;
    this.pits[M2] = 0;

    // Randomly assign the starting player.
    this.current = Math.random() < 0.5 ? P1 : P2;
    this.gameOver = false;
  }

  /**
   * Creates a deep copy of the current game state.
   * Used by logic.js and the bots to simulate moves without side effects.
   * @returns {MancalaState} A new, independent MancalaState instance.
   */
  clone() {
    const copy = new MancalaState(this.initialStones);
    copy.pits = [...this.pits];
    copy.current = this.current;
    copy.gameOver = this.gameOver;
    return copy;
  }

  /**
   * Overwrites this state in place with the contents of another state.
   * Lets the live game object adopt the result of a simulated turn without
   * anyone having to swap the object reference (the UI, controller, and
   * animator all share the same instance).
   * @param {MancalaState} other The state to copy from.
   * @returns {MancalaState} this, for chaining.
   */
  copyFrom(other) {
    this.initialStones = other.initialStones;
    this.pits = [...other.pits];
    this.current = other.current;
    this.gameOver = other.gameOver;
    return this;
  }
}
