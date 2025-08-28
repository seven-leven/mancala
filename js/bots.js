import { P2 } from "./engine.js";

// --- AI Controllers ---
export class RandomAI {
  constructor(engine) {
    this.e = engine;
  }
  choose() {
    const moves = this.e.validMoves(P2);
    return moves.length > 0
      ? moves[Math.floor(Math.random() * moves.length)]
      : null;
  }
}

export class DFS_AI {
  constructor(engine, maxDepth = 8) {
    this.e = engine;
    this.maxDepth = maxDepth;
  }

  choose() {
    const validStartMoves = this.e.validMoves(P2);
    if (validStartMoves.length === 0) return null;

    let bestStartMove = validStartMoves[0];
    let maxScore = -Infinity;

    for (const startMove of validStartMoves) {
      const simEngine = this.e.clone();
      const scoreFromThisTurn = this.findBestTurnOutcome(
        simEngine,
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

  findBestTurnOutcome(engineState, startMove, depth) {
    if (depth >= this.maxDepth) {
      return engineState.pits[engineState.storeOf(P2)];
    }

    const turnResult = engineState.simulateTurn(startMove);

    if (!turnResult.freeTurn) {
      return engineState.pits[engineState.storeOf(P2)];
    }

    const nextMoves = engineState.validMoves(P2);
    if (nextMoves.length === 0) {
      return engineState.pits[engineState.storeOf(P2)];
    }

    let maxScoreFromContinuation = -Infinity;
    for (const nextMove of nextMoves) {
      const nextState = engineState.clone();
      const score = this.findBestTurnOutcome(nextState, nextMove, depth + 1);
      if (score > maxScoreFromContinuation) {
        maxScoreFromContinuation = score;
      }
    }
    return maxScoreFromContinuation;
  }
}
