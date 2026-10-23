/**
 * Where Chrome (or Edge) is, for the tools that render pages to PNG with puppeteer: CHROME_PATH, or
 * the usual install locations.
 */
import { statSync } from "node:fs";

const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export function findChrome(): string {
  const chrome = process.env.CHROME_PATH ?? CANDIDATES.find((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  });
  if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH.");
  return chrome;
}
