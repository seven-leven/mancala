/**
 * Renders docs/design-guide.html to docs/design-guide.png with headless Chrome.
 * Run after changing docs/DESIGN.md's tokens or public/style.css:  deno task design-sheet
 *
 * Chrome is found at CHROME_PATH or the usual install locations.
 */
import puppeteer from "puppeteer-core";

const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const chrome = Deno.env.get("CHROME_PATH") ?? CANDIDATES.find((p) => {
  try {
    return Deno.statSync(p).isFile;
  } catch {
    return false;
  }
});
if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH.");

const page = new URL("../docs/design-guide.html", import.meta.url);
const out = new URL("../docs/design-guide.png", import.meta.url);

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--hide-scrollbars"] });
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1.5 });
  await tab.goto(page.href, { waitUntil: "networkidle0" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: decodeURIComponent(out.pathname.replace(/^\/([A-Z]:)/, "$1")), fullPage: true });
  console.log(`Wrote ${out.pathname.split("/").slice(-2).join("/")}`);
} finally {
  await browser.close();
}
