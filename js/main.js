// main.js — wires the pieces together and starts the game.

import { MancalaState } from "./state.js";
import { UI } from "./ui.js";
import { GameController } from "./game-controller.js";
import { AnimationHandler } from "./animation-handler.js";
import { OPPONENTS } from "./bots.js";

class Main {
  constructor() {
    const state = new MancalaState();

    // The UI and controller reference each other, so create the controller
    // first with a placeholder UI, then backfill once the UI exists.
    const controller = new GameController(state, null, null);
    const ui = new UI(state, controller);
    const animator = new AnimationHandler(ui);

    controller.ui = ui;
    controller.animator = animator;

    // Fill the opponent dropdown from the bot registry.
    ui.populateModes(OPPONENTS);

    // Wire up user input. Changing the mode starts a fresh game.
    ui.bindControls(
      () => controller.newGame(),
      () => controller.newGame(),
    );
    ui.bindSkip(() => controller.requestSkip());
    ui.attachPitHandlers((i) => controller.handlePitClick(i));

    controller.newGame();

    // Greet first-time players with the rules.
    ui.showRules();
  }
}

new Main();
