import { M1, M2, MancalaState, P1, P1_PITS, P2, P2_PITS } from "./state.js";
import {
  getValidMoves,
  isOwnSmallPit,
  isSmallPit,
  oppositeOf,
  oppStoreOf,
  playTurn,
  storeOf,
  wait,
} from "./logic.js";
import { DFS_AI, RandomAI } from "./bots.js";
import { UI } from "./ui.js";

// Helper for board traversal during animation
const ORDER = [0, 1, 2, 3, 4, 5, 6, 14, 13, 12, 11, 10, 9, 8, 7, 15];
const NEXT = new Map(ORDER.map((v, i) => [v, ORDER[(i + 1) % ORDER.length]]));

class App {
  constructor() {
    this.state = new MancalaState(7);
    this.ui = new UI(this.state, this);
    this.locked = false;
    this.ai = null;
    this.setAIMode();
    this.ui.attachPitHandlers();
    this.postStart();
  }

  setAIMode() {
    this.mode = document.getElementById("mode").value;
    if (this.mode === "pvc") {
      this.ai = new RandomAI(this.state);
    } else if (this.mode === "pvc-dfs") {
      this.ai = new DFS_AI(this.state, 8);
    } else {
      this.ai = null;
    }
  }

  postStart() {
    this.locked = false;
    this.ui.renderAll();
    this.ui.message(`Player ${this.state.current} starts.`);
    this.maybeAITurn();
  }

  newGame() {
    this.state.reset();
    this.setAIMode();
    this.postStart();
  }

  async handlePitClick(i) {
    if (this.locked || this.state.gameOver) return;
    const p = this.state.current;
    const isHumanTurn = p === P1 || (p === P2 && this.mode === "pvp");
    if (!isHumanTurn || this.state.pits[i] === 0) return;
    await this.playTurnAnimated(i);
  }

  /**
   * Performs the sowing of stones with UI animations. This logic was moved
   * from the old engine.js to keep the new logic.js pure.
   */
  async performAnimatedMove(startIndex) {
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
    return pos; // Return the landing pit
  }

  /**
   * Plays a turn for a human or AI, showing animations. This function now
   * contains the logic for captures and game-over checks, which were previously
   * in engine.js's playTurn method.
   */
  async playTurnAnimated(startIndex) {
    if (
      this.state.gameOver ||
      !isOwnSmallPit(this.state.current, startIndex) ||
      this.state.pits[startIndex] === 0
    ) {
      return;
    }

    this.locked = true;
    this.ui.renderAll(); // Un-highlights pits immediately

    // Sowing phase
    let lastPit = await this.performAnimatedMove(startIndex);
    while (isSmallPit(lastPit) && this.state.pits[lastPit] > 1) {
      lastPit = await this.performAnimatedMove(lastPit);
    }

    let freeTurn = false;

    // Check for free turn
    if (lastPit === storeOf(this.state.current)) {
      freeTurn = true;
    }

    // Check for capture
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

    // Check for game over
    this.checkGameOver();

    // Render the final state of the turn
    this.ui.renderAll();

    if (this.state.gameOver) {
      const p1 = this.state.pits[M1], p2 = this.state.pits[M2];
      const winner = p1 === p2
        ? "Draw"
        : p1 > p2
        ? "Player 1 wins!"
        : "Player 2 wins!";
      this.ui.message(winner);
      this.locked = true; // Game ends, no more moves
      return;
    }

    if (freeTurn) {
      this.ui.message("Free turn! Play again.");
      this.locked = false; // Unlock for the same player
      await this.maybeAITurn(); // Check if the AI has a free turn
    } else {
      // Switch players if the turn ended
      this.state.current = this.state.current === P1 ? P2 : P1;
      this.locked = false;
      this.ui.renderAll();
      await this.maybeAITurn(); // Check if the new player is an AI
    }
  }

  checkGameOver() {
    if (this.state.gameOver) return;
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
    }
  }

  async maybeAITurn() {
    if (
      !this.ai || this.state.current !== P2 || this.state.gameOver ||
      this.locked
    ) {
      return;
    }

    this.locked = true;
    this.ui.message("Computer is thinking…");
    await wait(this.mode === "pvc-dfs" ? 100 : 500);

    // AI uses the state to choose a move
    const move = this.ai.choose(this.state);

    if (move !== null) {
      // The AI move is also played with animations for the user to see
      await this.playTurnAnimated(move);
    } else {
      this.locked = false;
      this.ui.renderAll();
    }
  }
}

const app = new App();
