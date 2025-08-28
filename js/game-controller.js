import { M1, M2, P1, P2 } from "./state.js";
import { DFS_AI, RandomAI } from "./bots.js";
import { wait } from "./logic.js";

export class GameController {
  constructor(state, ui, animationHandler) {
    this.state = state;
    this.ui = ui;
    this.animator = animationHandler;
    this.locked = false;
    this.ai = null;
  }

  setAIMode() {
    this.mode = document.getElementById("mode").value;
    if (this.mode === "pvc") {
      this.ai = new RandomAI();
    } else if (this.mode === "pvc-dfs") {
      this.ai = new DFS_AI(8);
    } else {
      this.ai = null;
    }
  }

  newGame() {
    this.state.reset();
    this.setAIMode();
    this.locked = false;
    this.ui.renderAll();
    this.ui.message(`Player ${this.state.current} starts.`);
    this.maybeAITurn();
  }

  async handlePitClick(i) {
    if (this.locked || this.state.gameOver) return;

    const p = this.state.current;
    const isHumanTurn = p === P1 || (p === P2 && this.mode === "pvp");
    if (!isHumanTurn || this.state.pits[i] === 0) return;

    // --- DELEGATION ---
    // Tell the animator to play the turn and wait for the result.
    this.locked = true;
    this.ui.renderAll();
    const turnResult = await this.animator.playTurnAnimated(i);
    this.processTurnResult(turnResult);
  }

  async maybeAITurn() {
    if (!this.ai || this.state.current !== P2 || this.state.gameOver) {
      return;
    }

    this.locked = true;
    this.ui.message("Computer is thinking…");
    await wait(this.mode === "pvc-dfs" ? 100 : 500);

    const move = this.ai.choose(this.state);
    if (move !== null) {
      const turnResult = await this.animator.playTurnAnimated(move);
      this.processTurnResult(turnResult);
    } else {
      this.locked = false;
    }
  }

  processTurnResult(result) {
    // The animator has finished; now decide what to do next.
    this.ui.renderAll();

    if (result.gameOver) {
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

    if (result.freeTurn) {
      this.ui.message("Free turn! Play again.");
      this.locked = false;
      this.maybeAITurn(); // It might be the AI's free turn.
    } else {
      // Switch players and check for AI turn.
      this.state.current = this.state.current === P1 ? P2 : P1;
      this.locked = false;
      this.ui.renderAll();
      this.maybeAITurn();
    }
  }
}
