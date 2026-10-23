/**
 * Redraws the diagrams in docs/images/: each SVG follows the reader's light or dark setting, and
 * the ones the README and TODO show as pictures are also drawn as a light and a dark PNG (with
 * headless Chrome, at twice the size). Then dprint formats the SVGs, as the checks expect.
 *
 *   npm run diagrams                       every diagram
 *   npm run diagrams -- solved-boards      just these
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "../../tools/chrome.ts";
import { botFamilies } from "./bot-families.ts";
import { learnedBot } from "./learned-bot.ts";
import { ratingReading, ratingSession } from "./rating.ts";
import { solvedBoards } from "./solved-boards.ts";
import { solver } from "./solver.ts";
import type { Diagram } from "./svg.ts";

const ALL: Diagram[] = [botFamilies, solvedBoards, solver, learnedBot, ratingSession, ratingReading];
const names = process.argv.slice(2);
const chosen = names.length ? ALL.filter((d) => names.includes(d.name)) : ALL;
if (!chosen.length) throw new Error(`No diagram called ${names.join(", ")}; try ${ALL.map((d) => d.name).join(", ")}`);

const out = (file: string) => fileURLToPath(new URL(`../../docs/images/${file}`, import.meta.url));
const written: string[] = [];
for (const d of chosen) {
  writeFileSync(out(`${d.name}.svg`), d.draw("auto").svg);
  written.push(out(`${d.name}.svg`));
  console.log(`Wrote docs/images/${d.name}.svg`);
}
const pictures = chosen.filter((d) => d.png);
if (pictures.length) {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--hide-scrollbars"] });
  try {
    const tab = await browser.newPage();
    for (const d of pictures) {
      for (const theme of ["light", "dark"] as const) {
        const { svg, width, height } = d.draw(theme);
        await tab.setViewport({ width, height, deviceScaleFactor: 2 });
        await tab.setContent(`<!doctype html><body style="margin:0">${svg}</body>`, { waitUntil: "load" });
        await tab.evaluate(() => document.fonts.ready);
        const file = `${d.name}${theme === "dark" ? "-dark" : ""}.png`;
        await tab.screenshot({ path: out(file), clip: { x: 0, y: 0, width, height } });
        console.log(`Wrote docs/images/${file}`);
      }
    }
  } finally {
    await browser.close();
  }
}
// Format the SVGs the way the checks want them.
const dprint = fileURLToPath(new URL("../../node_modules/dprint/bin.cjs", import.meta.url));
execFileSync(process.execPath, [dprint, "fmt", ...written], { stdio: "inherit" });
