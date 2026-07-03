import { M1, M2, P1, P1_PITS, P2_PITS } from "./state.js";

/**
 * Manages all interaction with the DOM: it renders the game state and reports
 * user input back to the controller. It holds no game logic — every decision is
 * delegated to the controller, and every animation step is driven by events.
 */
export class UI {
  /**
   * @param {MancalaState} state The game state to render.
   * @param {GameController} controller Consulted for the `locked` flag and the
   *   active bot (used to name Player 2 in the turn banner).
   */
  constructor(state, controller) {
    this.state = state;
    this.controller = controller;

    // Cache the fixed DOM elements.
    this.board = document.getElementById("board");
    this.turnDot = document.getElementById("turnDot");
    this.turnText = document.getElementById("turnText");
    this.turnBanner = document.getElementById("turnBanner");
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
    this.skipBtn = document.getElementById("skipBtn");

    // Rules popup.
    this.rulesOverlay = document.getElementById("rulesOverlay");
    this.rulesBtn = document.getElementById("rulesBtn");
    this.closeRulesBtn = document.getElementById("closeRules");

    // Per-pit element caches, filled by createPits().
    this.pitEls = new Array(14);
    this.countEls = new Array(14);

    this.createPits();
    this.bindRules();
  }

  /**
   * Builds the 14 small-pit elements so the DOM order matches the direction
   * stones actually travel: the bottom row runs left→right into Player 1's
   * store on the right, and the top row runs right→left toward Player 2's store
   * on the left. This makes a sow look like one continuous loop around the board.
   */
  createPits() {
    const build = (row, indices, playerClass) => {
      row.innerHTML = "";
      for (const i of indices) {
        const el = document.createElement("div");
        el.className = `pit ${playerClass}`;
        el.id = `pit_${i}`;
        el.innerHTML = `<div class="count" id="c_${i}">0</div>`;
        row.appendChild(el);
        this.pitEls[i] = el;
        this.countEls[i] = el.querySelector(".count");
      }
    };

    // Top row left→right = 7..13, so pit 13 sits next to P1's store (right) and
    // pit 7 sits next to P2's store (left) — matching the sowing order.
    build(this.rowTop, [7, 8, 9, 10, 11, 12, 13], "p2");
    build(this.rowBottom, [0, 1, 2, 3, 4, 5, 6], "p1");
  }

  /**
   * Populates the opponent dropdown from a list of { value, label } entries.
   * @param {{value: string, label: string}[]} options
   */
  populateModes(options) {
    this.modeSelect.innerHTML = "";
    for (const { value, label } of options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      this.modeSelect.appendChild(opt);
    }
  }

  /**
   * Binds the top-bar controls. Handlers are injected by main.js so the UI stays
   * decoupled from the controller's implementation.
   */
  bindControls(newGameHandler, modeChangeHandler) {
    this.newGameBtn.addEventListener("click", newGameHandler);
    this.modeSelect.addEventListener("change", modeChangeHandler);
  }

  /** Binds the Skip button, which fast-forwards the running animation. */
  bindSkip(skipHandler) {
    this.skipBtn.addEventListener("click", skipHandler);
  }

  /**
   * Attaches a click handler to every small pit.
   * @param {(index: number) => void} pitClickHandler
   */
  attachPitHandlers(pitClickHandler) {
    for (let i = 0; i <= 13; i++) {
      this.pitEls[i].addEventListener("click", () => pitClickHandler(i));
    }
  }

  /** Returns the count element for a pit or store index. */
  countElFor(i) {
    if (i === M1) return this.c_m1;
    if (i === M2) return this.c_m2;
    return this.countEls[i];
  }

  /**
   * Renders the entire board from the current state. This is the authoritative
   * sync between model and view; the animation methods only tween toward it.
   */
  renderAll() {
    for (let i = 0; i <= 13; i++) {
      this.countEls[i].textContent = this.state.pits[i];
    }

    this.c_m1.textContent = this.state.pits[M1];
    this.c_m2.textContent = this.state.pits[M2];
    this.scoreP1.textContent = `Player 1: ${this.state.pits[M1]}`;
    this.scoreP2.textContent = `Player 2: ${this.state.pits[M2]}`;
    this.inHandEl.textContent = 0;

    this.renderTurn();

    // Controls stay usable during play, but lock while a move animates.
    const busy = this.controller.locked && !this.state.gameOver;
    this.newGameBtn.disabled = busy;
    this.modeSelect.disabled = busy;
    // Skip is the opposite: only useful while an animation is running.
    this.skipBtn.disabled = !busy;

    // Clear every highlight, then mark only the current player's legal moves.
    for (let i = 0; i <= 13; i++) {
      this.pitEls[i].classList.remove("selectable", "active");
    }
    if (!this.state.gameOver && !this.controller.locked) {
      const ownPits = this.state.current === P1 ? P1_PITS : P2_PITS;
      for (const i of ownPits) {
        if (this.state.pits[i] > 0) this.pitEls[i].classList.add("selectable");
      }
    }
  }

  /**
   * Updates the turn banner and dims whichever side is not to move, so it's
   * always obvious who is playing.
   */
  renderTurn() {
    const p = this.state.current;

    // Highlight the active side; dim the other. (No dimming once the game ends.)
    this.board.classList.remove("turn-p1", "turn-p2");
    if (!this.state.gameOver) this.board.classList.add(`turn-p${p}`);

    this.turnDot.className = `dot p${p}`;
    this.turnBanner.className = `turnbanner p${p}`;

    if (this.state.gameOver) {
      this.turnText.textContent = "Game over";
      return;
    }
    this.turnText.textContent = `${this.playerLabel(p)} to play`;
  }

  /** Human-friendly name for a player, including the bot's name for P2. */
  playerLabel(p) {
    if (p === P1) return "Player 1";
    if (this.controller.ai && this.modeSelect.selectedOptions[0]) {
      return this.modeSelect.selectedOptions[0].textContent; // e.g. "DFS Bot"
    }
    return "Player 2";
  }

  // --- Rules popup ---

  bindRules() {
    this.rulesBtn.addEventListener("click", () => this.showRules());
    this.closeRulesBtn.addEventListener("click", () => this.hideRules());
    // Dismiss by clicking the backdrop or pressing Escape.
    this.rulesOverlay.addEventListener("click", (e) => {
      if (e.target === this.rulesOverlay) this.hideRules();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hideRules();
    });
  }

  showRules() {
    this.rulesOverlay.classList.add("open");
  }

  hideRules() {
    this.rulesOverlay.classList.remove("open");
  }

  // --- Animation feedback (called by the AnimationHandler) ---

  /** A pit is emptied into the hand. */
  pickup(from, count) {
    this.inHandEl.textContent = count;
    this.countEls[from].textContent = 0;
    this.pitEls[from].classList.add("active");
  }

  /** One stone is dropped into a pit or store. */
  drop(to, newCount, inHand) {
    this.inHandEl.textContent = inHand;
    const countEl = this.countElFor(to);
    if (!countEl) return;
    countEl.textContent = newCount;
    // Brief pulse for feedback.
    countEl.classList.add("pulsing");
    setTimeout(() => countEl.classList.remove("pulsing"), 300);
  }

  /** A capture resolves: clear both pits and top up the store. */
  capture({ landing, opposite, captured, store, storeCount }) {
    this.countEls[landing].textContent = 0;
    this.countEls[opposite].textContent = 0;
    this.countElFor(store).textContent = storeCount;
    this.message(`Capture! ${captured} stones taken.`);
  }

  /** The board is swept into the stores at game end. */
  sweep() {
    this.message("Game over! Sweeping remaining stones.");
  }

  /** Shows a transient status message in the toast. */
  message(txt) {
    this.toast.textContent = txt;
    this.toast.style.opacity = "1";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toast.style.opacity = "0";
    }, 3000);
  }
}
