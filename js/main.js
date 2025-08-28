// main.js

import { MancalaState } from "./state.js";
import { UI } from "./ui.js";
import { GameController } from "./game-controller.js";
import { AnimationHandler } from "./animation.js"; // Assuming you have this file

class Main {
  constructor() {
    const state = new MancalaState();

    // 1. Create the controller first, but pass null for the UI and animator for now.
    //    We can't create the UI yet because it doesn't exist.
    const controller = new GameController(state, null, null);

    // 2. Now create the UI, passing the controller instance you just made.
    //    The UI will now have a valid reference to the controller.
    const ui = new UI(state, controller);

    // 3. Create the animation handler (assuming it needs state and ui).
    const animator = new AnimationHandler(state, ui);

    // 4. Now that the ui and animator objects exist, assign them back to the controller.
    controller.ui = ui;
    controller.animator = animator;

    // 5. Bind the UI event handlers to the controller's methods.
    ui.bindControls(
      () => controller.newGame(),
      () => controller.newGame() // Or a specific mode change handler
    );
    ui.attachPitHandlers((i) => controller.handlePitClick(i));

    // 6. Start the first game.
    controller.newGame();
  }
}

new Main();
