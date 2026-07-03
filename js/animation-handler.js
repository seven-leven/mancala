import { wait } from "./logic.js";

// Delays (ms) that pace the animation.
const DROP_DELAY = 220; // Between each sown stone.
const CAPTURE_PAUSE = 200; // Beat before a capture resolves.

/**
 * Replays the event log produced by playTurn() as a visual animation.
 *
 * It holds no game rules of its own — it walks the events in order and asks the
 * UI to reflect each one. This keeps the on-screen board in step with the pure
 * simulation, so the two can never drift apart.
 *
 * Setting `skip = true` (via the Skip button) drops the per-stone delays so the
 * rest of the move — and any follow-on moves that reuse the flag — resolve
 * instantly. Each event is still applied, so the board ends in the right place.
 */
export class AnimationHandler {
  constructor(ui) {
    this.ui = ui;
    this.skip = false;
  }

  /**
   * @param {object[]} events The event log from playTurn().
   */
  async animate(events) {
    for (const ev of events) {
      switch (ev.type) {
        case "pickup":
          this.ui.pickup(ev.pit, ev.count);
          break;

        case "drop":
          this.ui.drop(ev.pit, ev.count, ev.inHand);
          if (!this.skip) await wait(DROP_DELAY);
          break;

        case "capture":
          if (!this.skip) await wait(CAPTURE_PAUSE);
          this.ui.capture(ev);
          break;

        case "sweep":
          this.ui.sweep(ev);
          break;
      }
    }
  }
}
