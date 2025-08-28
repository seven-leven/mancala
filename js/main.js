import { MancalaState } from "./state.js";
import { UI } from "./ui.js";
import { GameController } from "./game-controller.js";
import { AnimationHandler } from "./animation-handler.js";

/**
 * The composition root of the application.
 * It instantiates all the major components and wires them together.
 */
class Main {
  constructor() {
    const state = new MancalaState(7);
    const ui = new UI(state);
    const animationHandler = new AnimationHandler(state, ui);

    // The controller is the main orchestrator.
    const controller = new GameController(state, ui, animationHandler);

    // We pass the controller's methods to the UI for event binding.
    ui.bindControls(
      () => controller.newGame(),
      () => controller.newGame(), // Also reset on mode change
    );
    ui.attachPitHandlers((index) => controller.handlePitClick(index));

    // Start the first game.
    controller.newGame();
  }
}

// Start the application.
new Main();
