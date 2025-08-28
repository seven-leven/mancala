import {
  isOwnSmallPit,
  isSmallPit,
  oppositeOf,
  oppStoreOf,
  storeOf,
  wait,
} from "./logic.js";
import { M1, M2, P1_PITS, P2_PITS } from "./state.js";

// Helper for board traversal
const ORDER = [0, 1, 2, 3, 4, 5, 6, 14, 13, 12, 11, 10, 9, 8, 7, 15];
const NEXT = new Map(ORDER.map((v, i) => [v, ORDER[(i + 1) % ORDER.length]]));

export class AnimationHandler {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
  }

  async playTurnAnimated(startIndex) {
    // 1. SOWING PHASE
    let inHand = this.state.pits[startIndex];
    this.state.pits[startIndex] = 0;
    this.ui.pickup(startIndex, inHand);

    let pos = NEXT.get(startIndex);
    while (inHand > 0) {
      if (pos === oppStoreOf(this.state.current)) {
        pos = NEXT.get(pos);
        continue;
      }
      this.state.pits[pos]++;
      inHand--;
      this.ui.drop(pos, this.state.pits[pos], inHand);
      await wait(220);
      if (inHand > 0) pos = NEXT.get(pos);
    }
    let lastPit = pos;

    // Handle chained moves (landing in a pit with stones)
    while (isSmallPit(lastPit) && this.state.pits[lastPit] > 1) {
      lastPit = await this.playTurnAnimated(lastPit);
    }

    // 2. OUTCOME CHECKING PHASE
    let freeTurn = false;
    if (lastPit === storeOf(this.state.current)) {
      freeTurn = true;
    }

    // Capture Check
    if (
      isOwnSmallPit(this.state.current, lastPit) &&
      this.state.pits[lastPit] === 1
    ) {
      const opp = oppositeOf(lastPit);
      const captured = this.state.pits[opp];
      if (captured > 0) {
        this.state.pits[opp] = 0;
        this.state.pits[storeOf(this.state.current)] += captured + 1;
        this.state.pits[lastPit] = 0;
        this.ui.capture(
          lastPit,
          opp,
          captured + 1,
          storeOf(this.state.current),
        );
      }
    }

    // Game Over Check
    const gameOver = this.checkGameOver();

    // 3. RETURN RESULT
    // Return a summary of what happened for the controller to process.
    return { freeTurn, gameOver };
  }

  checkGameOver() {
    if (this.state.gameOver) return true;
    const p1Empty = P1_PITS.every((i) => this.state.pits[i] === 0);
    const p2Empty = P2_PITS.every((i) => this.state.pits[i] === 0);

    if (p1Empty || p2Empty) {
      const p1Remain = P1_PITS.reduce((a, i) => a + this.state.pits[i], 0);
      const p2Remain = P2_PITS.reduce((a, i) => a + this.state.pits[i], 0);
      for (const i of P1_PITS) this.state.pits[i] = 0;
      for (const i of P2_PITS) this.state.pits[i] = 0;
      this.state.pits[M1] += p1Remain;
      this.state.pits[M2] += p2Remain;
      this.ui.sweep(p1Remain, p2Remain);
      this.state.gameOver = true;
      return true;
    }
    return false;
  }
}
