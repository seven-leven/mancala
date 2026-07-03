import { P1, P2 } from "./state.js";
import { BOT_REGISTRY } from "./bots.js";
import { playTurn, wait } from "./logic.js";

/**
 * Orchestrates the game: it validates input, drives a move through the pure
 * playTurn() rules, hands the resulting event log to the animator, then adopts
 * the new state and decides what happens next (free turn, game over, AI reply).
 *
 * The controller owns no rules of its own — logic.js is the source of truth.
 */
export class GameController {
  constructor(state, ui, animator) {
    this.state = state;
    this.ui = ui;
    this.animator = animator;
    this.locked = false;
    this.ai = null; // null means the opponent is human (Player vs Player).
  }

  /** Reads the opponent dropdown and builds the matching bot (or none). */
  setOpponent() {
    const id = this.ui.modeSelect.value;
    const entry = BOT_REGISTRY.get(id);
    this.ai = entry ? entry.create() : null;
  }

  newGame() {
    this.state.reset();
    this.setOpponent();
    this.locked = false;
    this.animator.skip = false;
    this.ui.renderAll();
    this.ui.message(`Player ${this.state.current} starts.`);
    this.maybeAITurn();
  }

  /**
   * Fast-forwards the running animation. The flag stays set until the next human
   * move begins, so one press skips this move and any follow-on moves (e.g. the
   * bot's reply) right up to your next turn.
   */
  requestSkip() {
    if (this.locked) this.animator.skip = true;
  }

  /** Is it currently a human's move? P1 is always human; P2 only in PvP. */
  isHumanTurn() {
    return this.ai === null || this.state.current === P1;
  }

  async handlePitClick(i) {
    if (this.locked || this.state.gameOver || !this.isHumanTurn()) return;
    if (this.state.pits[i] === 0) return;
    // A fresh human move animates normally unless Skip is pressed again.
    this.animator.skip = false;
    await this.playMove(i);
  }

  async maybeAITurn() {
    if (!this.ai || this.state.gameOver || this.state.current !== P2) return;

    this.locked = true;
    this.ui.renderAll();
    // Skip also collapses the bot's "thinking" pause, so a fast-forwarded chain
    // resolves at once instead of ticking through each delay.
    if (!this.animator.skip) {
      this.ui.message("Computer is thinking…");
      await wait(this.ai.thinkDelay ?? 400);
    }

    const move = this.ai.choose(this.state);
    if (move === null) {
      this.locked = false;
      this.ui.renderAll();
      return;
    }
    await this.playMove(move);
  }

  /**
   * Plays one move end to end: simulate, animate, adopt the result, react.
   */
  async playMove(i) {
    const result = playTurn(this.state, i);
    if (result.invalid) return;

    this.locked = true;
    this.ui.renderAll();

    await this.animator.animate(result.events);

    // Adopt the simulated outcome (playTurn has already switched players and
    // resolved captures / sweeps / the winner for us).
    this.state.copyFrom(result.newState);
    this.ui.renderAll();

    this.afterMove(result);
  }

  afterMove(result) {
    if (result.gameOver) {
      const winner = result.winner === null
        ? "It's a draw!"
        : `Player ${result.winner} wins!`;
      this.ui.message(winner);
      this.locked = true; // No more moves.
      return;
    }

    if (result.freeTurn) {
      this.ui.message("Free turn! Play again.");
    }

    this.locked = false;
    this.ui.renderAll();
    this.maybeAITurn(); // Continue if it's now (or still) the AI's turn.
  }
}
