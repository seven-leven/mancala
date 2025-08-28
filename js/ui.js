import { M1, M2, P1, P1_PITS, P2_PITS } from "./state.js";

/**
 * Manages all interactions with the DOM.
 * This class is responsible for rendering the game state and listening for user input,
 * but it does not contain any game logic itself. It delegates all actions to the controller.
 */
export class UI {
  /**
   * @param {MancalaState} state The game state object to render.
   * @param {GameController} controller The controller holding the application's locked status.
   */
  constructor(state, controller) {
    this.state = state;
    this.controller = controller; // Used to check the 'locked' status for disabling controls.

    // Cache all necessary DOM elements for performance.
    this.turnDot = document.getElementById("turnDot");
    this.turnText = document.getElementById("turnText");
    this.inHandEl = document.getElementById("inHand");
    this.toast = document.getElementById("toast");
    this.scoreP1 = document.getElementById("scoreP1");
    this.scoreP2 = document.getElementById("scoreP2");
    this.rowTop = document.getElementById("rowTop");
    this.rowBottom = document.getElementById("rowBottom");
    this.c_m1 = document.getElementById("c_m1");
    this.c_m2 = document.getElementById("c_m2");
    this.newGameBtn = document.getElementById("newGame");
    this.modeSelect = document.getElementById("mode");

    this.createPits();
  }

  /**
   * Dynamically generates the HTML for the pits on the board.
   */
  createPits() {
    this.rowTop.innerHTML = "";
    for (let i = 13; i >= 7; i--) { // Rendered in reverse to match visual layout
      const el = document.createElement("div");
      el.className = `pit p2`;
      el.id = `pit_${i}`;
      el.innerHTML = `<div class="count" id="c_${i}">0</div>`;
      this.rowTop.appendChild(el);
    }
    this.rowBottom.innerHTML = "";
    for (let i = 0; i <= 6; i++) {
      const el = document.createElement("div");
      el.className = `pit p1`;
      el.id = `pit_${i}`;
      el.innerHTML = `<div class="count" id="c_${i}">0</div>`;
      this.rowBottom.appendChild(el);
    }
  }

  /**
   * Binds event listeners to the main control buttons.
   * The handler functions are provided from the outside (by main.js),
   * decoupling the UI from the controller's implementation.
   * @param {Function} newGameHandler The function to call when 'New Game' is clicked.
   * @param {Function} modeChangeHandler The function to call when the mode is changed.
   */
  bindControls(newGameHandler, modeChangeHandler) {
    this.newGameBtn.addEventListener("click", newGameHandler);
    this.modeSelect.addEventListener("change", modeChangeHandler);
  }

  /**
   * Attaches click event listeners to each pit on the board.
   * @param {Function} pitClickHandler The function to call with the pit index when clicked.
   */
  attachPitHandlers(pitClickHandler) {
    // Iterate from 0 to 13 to cover all small pits.
    for (let i = 0; i <= 13; i++) {
      document.getElementById(`pit_${i}`).addEventListener(
        "click",
        () => pitClickHandler(i),
      );
    }
  }

  /**
   * Renders the entire board based on the current state.
   * This is the main function for synchronizing the view with the model.
   */
  renderAll() {
    // Update stone counts in all small pits.
    for (let i = 0; i <= 13; i++) {
      document.getElementById(`c_${i}`).textContent = this.state.pits[i];
    }

    // Update stone counts in the Mancalas.
    this.c_m1.textContent = this.state.pits[M1];
    this.c_m2.textContent = this.state.pits[M2];
    this.scoreP1.textContent = `P1: ${this.state.pits[M1]}`;
    this.scoreP2.textContent = `P2: ${this.state.pits[M2]}`;

    // Update turn indicator.
    const turnPlayer = this.state.current;
    this.turnText.textContent = `Player ${turnPlayer}'s Turn`;
    this.turnDot.className = `dot p${turnPlayer}`;

    // Control the enabled/disabled state of buttons based on the controller's lock status.
    // The UI should be non-interactive while an animation or AI is thinking.
    this.newGameBtn.disabled = this.controller.locked && !this.state.gameOver;
    this.modeSelect.disabled = this.controller.locked && !this.state.gameOver;

    // Remove all highlights first.
    document.querySelectorAll(".pit").forEach((el) =>
      el.classList.remove("selectable", "active")
    );

    // Add 'selectable' class to valid moves for the current player if the game is not locked.
    if (!this.state.gameOver && !this.controller.locked) {
      const pitsToToggle = this.state.current === P1 ? P1_PITS : P2_PITS;
      for (const i of pitsToToggle) {
        if (this.state.pits[i] > 0) {
          document.getElementById(`pit_${i}`).classList.add("selectable");
        }
      }
    }
  }

  // --- Animation and Feedback Methods ---

  pickup(from, count) {
    this.inHandEl.textContent = count;
    document.getElementById(`c_${from}`).textContent = 0;
    document.getElementById(`pit_${from}`).classList.add("active");
  }

  drop(to, newCount, inHand) {
    this.inHandEl.textContent = inHand;
    const isMancala = to === M1 || to === M2;
    const elId = isMancala ? `c_m${to === M1 ? 1 : 2}` : `c_${to}`;
    const countEl = document.getElementById(elId);

    if (countEl) {
      countEl.textContent = newCount;
      // Add a pulsing effect for visual feedback.
      countEl.parentElement.classList.add("pulsing");
      setTimeout(() => countEl.parentElement.classList.remove("pulsing"), 300);
    }
  }

  capture(landing, opposite, captured, toStore) {
    this.message(`Capture! ${captured} stones taken.`);
  }

  sweep(p1Remain, p2Remain) {
    this.message("Game over! Sweeping remaining stones.");
    this.renderAll(); // Re-render to show final scores after sweep.
  }

  message(txt) {
    this.toast.textContent = txt;
    this.toast.style.opacity = "1";
    setTimeout(() => {
      this.toast.style.opacity = "0";
    }, 3000);
  }
}
