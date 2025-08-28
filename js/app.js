import { MancalaEngine, P1, P2, wait } from "./engine.js";
import { DFS_AI, RandomAI } from "./bots.js";
import { UI } from "./ui.js";

class App {
  constructor() {
    this.engine = new MancalaEngine(7);
    this.ui = new UI(this.engine, this);
    this.locked = false;
    this.ai = null;
    this.setAIMode();
    this.ui.attachPitHandlers();
    this.postStart();
  }

  setAIMode() {
    this.mode = document.getElementById("mode").value;
    if (this.mode === "pvc") {
      this.ai = new RandomAI(this.engine);
    } else if (this.mode === "pvc-dfs") {
      this.ai = new DFS_AI(this.engine, 8);
    } else {
      this.ai = null;
    }
  }

  postStart() {
    this.locked = false;
    this.ui.renderAll();
    this.ui.message(`Player ${this.engine.current} starts.`);
    this.maybeAITurn();
  }

  newGame() {
    this.engine.reset();
    this.setAIMode();
    this.postStart();
  }

  async handlePitClick(i) {
    if (this.locked || this.engine.gameOver) return;
    const p = this.engine.current;
    const isHumanTurn = (p === P1) || (p === P2 && this.mode === "pvp");
    if (!isHumanTurn || this.engine.pits[i] === 0) return;
    await this.playTurnFrom(i);
  }

  // MODIFIED: Rewritten to correctly handle turn progression and prevent the rogue bot
  async playTurnFrom(startIndex) {
    this.locked = true;
    this.ui.renderAll(); // Un-highlights pits immediately

    const res = await this.engine.playTurn(startIndex, this.ui);

    if (this.engine.gameOver) {
      const p1 = this.engine.pits[M1], p2 = this.engine.pits[M2];
      const winner = p1 === p2
        ? "Draw"
        : (p1 > p2 ? "Player 1 wins!" : "Player 2 wins!");
      this.ui.message(winner);
      this.locked = true; // Game ends, no more moves
      this.ui.renderAll();
      return;
    }

    if (res.freeTurn) {
      this.ui.message("Free turn! Play again.");
      this.locked = false; // Unlock for the same player
      this.ui.renderAll();
      await this.maybeAITurn(); // Check if the AI has a free turn
      return; // IMPORTANT: Stop execution to prevent player switch
    }

    // If the turn ended, switch players
    this.engine.current = this.engine.current === P1 ? P2 : P1;
    this.locked = false;
    this.ui.renderAll();
    await this.maybeAITurn(); // Check if the new player is an AI
  }

  async maybeAITurn() {
    if (
      !this.ai || this.engine.current !== P2 || this.engine.gameOver ||
      this.locked
    ) {
      return;
    }

    this.locked = true;
    this.ui.message("Computer is thinking…");
    await wait(this.mode === "pvc-dfs" ? 100 : 500);

    const move = this.ai.choose();
    if (move !== null) {
      await this.playTurnFrom(move);
    } else {
      this.locked = false;
      this.ui.renderAll();
    }
  }
}

const app = new App();
