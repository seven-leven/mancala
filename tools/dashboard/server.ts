/**
 * The rating dashboard's server (`npm run rate -- --ui`): the page at http://localhost:8020/ and a
 * stream of snapshots (server-sent events) as the run goes. It runs on the tournament's main
 * thread, which mostly waits on the game workers; the 90% ranges are resampled on a thread of their
 * own. Snapshots are built only while a page is open, at most once a second.
 */
import * as esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { Snapshot } from "./snapshot.ts";

const HERE = new URL("./", import.meta.url);
const PUBLIC = new URL("../../public/", import.meta.url);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** The page's files: its own, plus the game's stylesheet and icons (the same design language). */
const FILES: Record<string, URL> = {
  "/": new URL("index.html", HERE),
  "/dashboard.css": new URL("dashboard.css", HERE),
  "/style.css": new URL("style.css", PUBLIC),
  "/svg/favicon.svg": new URL("svg/favicon.svg", PUBLIC),
};

export class Dashboard {
  readonly url: string;
  private clients = new Set<ServerResponse>();
  private last: string | null = null;
  private ranges: Worker | null = null;
  private busy = false;
  /** Resampled fits, the fit they were resampled around, the games they came from, and when they were last asked for. */
  samples: number[][] | null = null;
  samplesRating: number[] | null = null;
  samplesGames = 0;
  askedAt = -Infinity;
  /** Called when new ranges arrive, and when a page opens: both want a fresh snapshot. */
  onRanges: () => void = () => {};
  onWatch: () => void = () => {};

  private constructor(url: string) {
    this.url = url;
  }

  /** Starts serving on `port`, or the next free port after it. */
  static async start(port = 8020): Promise<Dashboard> {
    const bundle = await esbuild.build({
      entryPoints: [fileURLToPath(new URL("app.ts", HERE))],
      bundle: true,
      format: "esm",
      target: "es2022",
      write: false,
      logLevel: "warning",
    });
    const app = bundle.outputFiles[0].text;
    const dashboard = { current: null as Dashboard | null };
    const server = createServer(async (req, res) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path === "/events") return dashboard.current!.subscribe(res);
      if (path === "/app.js") return void res.writeHead(200, { "content-type": TYPES[".js"] }).end(app);
      const file = FILES[path];
      if (!file) return void res.writeHead(404).end("Not found");
      res.writeHead(200, { "content-type": TYPES[extname(file.pathname) || ".html"], "cache-control": "no-store" });
      res.end(await readFile(file));
    });
    for (let p = port; p < port + 10; p++) {
      const ok = await new Promise<boolean>((resolve) => {
        server.once("error", () => resolve(false));
        server.listen(p, "127.0.0.1", () => resolve(true));
      });
      if (ok) {
        // Nothing here should keep the process alive on its own: the run decides when to stop.
        server.unref();
        return dashboard.current = new Dashboard(`http://localhost:${p}/`);
      }
    }
    throw new Error(`--ui: ports ${port}–${port + 9} are all in use`);
  }

  /** Whether a page is open: snapshots are only worth building then. */
  get watching(): boolean {
    return this.clients.size > 0;
  }

  private subscribe(res: ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    if (this.last) res.write(this.last);
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
    if (!this.last) this.onWatch();
  }

  publish(snapshot: Snapshot): void {
    this.last = `data: ${JSON.stringify(snapshot)}\n\n`;
    for (const res of this.clients) res.write(this.last);
  }

  /** Resamples `results` on the ranges thread, unless it's already busy. */
  requestRanges(results: number[][][], games: number): void {
    if (this.busy) return;
    this.busy = true;
    this.askedAt = performance.now();
    this.ranges ??= new Worker(new URL("ranges-worker.ts", HERE));
    this.ranges.unref();
    this.ranges.once("message", ({ samples, rating }: { samples: number[][]; rating: number[] }) => {
      this.busy = false;
      [this.samples, this.samplesRating, this.samplesGames] = [samples, rating, games];
      this.onRanges();
    });
    this.ranges.postMessage(results);
  }

  /** Stops the ranges thread; the page stays up while the process runs. */
  stopRanges(): void {
    void this.ranges?.terminate();
    this.ranges = null;
  }

  /** Keeps the process alive, serving the last snapshot, until Ctrl+C. */
  stayOpen(): void {
    setInterval(() => {}, 1 << 30);
  }
}
