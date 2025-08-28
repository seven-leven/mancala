import { M1, M2, P1, P1_PITS, P2_PITS } from "./state.js";

export class UI {
  constructor(engine, app) {
    this.e = engine;
    this.app = app;
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
    this.bindControls();
  }

  createPits() {
    this.rowTop.innerHTML = "";
    for (let i = 7; i <= 13; i++) {
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

  bindControls() {
    this.newGameBtn.addEventListener("click", () => this.app.newGame());
    this.modeSelect.addEventListener("change", () => this.app.newGame());
  }

  attachPitHandlers() {
    for (let i = 0; i <= 13; i++) {
      document.getElementById(`pit_${i}`).addEventListener(
        "click",
        () => this.app.handlePitClick(i),
      );
    }
  }

  // MODIFIED: This function now controls the state of the buttons
  renderAll() {
    // Update all visual elements
    for (let i = 0; i <= 13; i++) {
      document.getElementById(`c_${i}`).textContent = this.e.pits[i];
    }
    this.c_m1.textContent = this.e.pits[M1];
    this.c_m2.textContent = this.e.pits[M2];
    this.scoreP1.textContent = `P1: ${this.e.pits[M1]}`;
    this.scoreP2.textContent = `P2: ${this.e.pits[M2]}`;
    const turnPlayer = this.e.current;
    this.turnText.textContent = `Player ${turnPlayer}'s Turn`;
    this.turnDot.className = `dot p${turnPlayer}`;

    // Control button states based on game state
    // The "New Game" button should be disabled only when the AI is thinking.
    this.newGameBtn.disabled = this.app.locked && !this.e.gameOver;
    // The mode dropdown should be disabled when any action is happening.
    this.modeSelect.disabled = this.app.locked && !this.e.gameOver;

    // Control pit selectability
    document.querySelectorAll(".pit").forEach((el) =>
      el.classList.remove("selectable", "active")
    );
    if (!this.e.gameOver && !this.app.locked) {
      const pitsToToggle = this.e.current === P1 ? P1_PITS : P2_PITS;
      for (const i of pitsToToggle) {
        if (this.e.pits[i] > 0) {
          document.getElementById(`pit_${i}`).classList.add("selectable");
        }
      }
    }
  }

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
      countEl.classList.add("pulsing");
      setTimeout(() => countEl.classList.remove("pulsing"), 300);
    }
  }

  capture(landing, opposite, captured, toStore) {
    this.message(`Capture! ${captured} stones taken.`);
  }
  sweep(p1Remain, p2Remain) {
    this.message("Game over! Sweeping remaining stones.");
    this.renderAll();
  }
  message(txt) {
    this.toast.textContent = txt;
    this.toast.style.opacity = "1";
    setTimeout(() => {
      this.toast.style.opacity = "0";
    }, 3000);
  }
}
