import { P2 } from "./state.js";
import { getValidMoves, playTurn, storeOf } from "./logic.js";

// --- AI Controllers ---
export class RandomAI {
  /**
   * The constructor is now empty as the AI is stateless.
   * The state is passed into the choose method.
   */
  constructor() {}

  choose(state) {
    const moves = getValidMoves(state, P2);
    return moves.length > 0
      ? moves[Math.floor(Math.random() * moves.length)]
      : null;
  }
}

export class DFS_AI {
  constructor(maxDepth = 8) {
    this.maxDepth = maxDepth;
  }

  /**
   * The AI's choice is now based on a state passed to it,
   * not an internal engine instance.
   * @param {MancalaState} state The current game state.
   */
  choose(state) {
    const validStartMoves = getValidMoves(state, P2);
    if (validStartMoves.length === 0) return null;

    let bestStartMove = validStartMoves[0];
    let maxScore = -Infinity;

    for (const startMove of validStartMoves) {
      // The simulation starts with a clone of the current state.
      const simState = state.clone();
      const scoreFromThisTurn = this.findBestTurnOutcome(
        simState,
        startMove,
        0,
      );

      if (scoreFromThisTurn > maxScore) {
        maxScore = scoreFromThisTurn;
        bestStartMove = startMove;
      }
    }
    return bestStartMove;
  }

  /**
   * This recursive function is now cleaner. It uses the pure playTurn function,
   * which does not mutate the state, making the simulation logic much safer.
   * @param {MancalaState} state The state to simulate from.
   * @param {number} startMove The move to simulate.
   * @param {number} depth The current recursion depth.
   */
  findBestTurnOutcome(state, startMove, depth) {
    // Base case: max depth reached
    if (depth >= this.maxDepth) {
      return state.pits[storeOf(P2)];
    }

    // Use the pure logic function to get the result of the move
    const turnResult = playTurn(state, startMove);
    const newState = turnResult.newState;

    // Base case: The turn ended, so no more moves can be made.
    // Return the score from the resulting state.
    if (!turnResult.freeTurn) {
      return newState.pits[storeOf(P2)];
    }

    // Recursive step: If it's a free turn, find the best possible outcome
    // from the subsequent moves.
    const nextMoves = getValidMoves(newState, P2);
    if (nextMoves.length === 0) {
      return newState.pits[storeOf(P2)]; // No more moves possible
    }

    let maxScoreFromContinuation = -Infinity;
    for (const nextMove of nextMoves) {
      // Recurse on the new state returned by the playTurn function
      const score = this.findBestTurnOutcome(newState, nextMove, depth + 1);
      if (score > maxScoreFromContinuation) {
        maxScoreFromContinuation = score;
      }
    }
    return maxScoreFromContinuation;
  }
}
