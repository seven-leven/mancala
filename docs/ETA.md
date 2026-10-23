# The rating run's ETA

How the rating harness predicts how long a run has left, how well it does, and the roadmap to doing better (ETA 2.0).
The code is [harness/rate/eta.ts](../harness/rate/eta.ts); its tests are `tests/eta_test.ts`.

## How it works now

Every run logs its predictions to `data/eta/<start time>.jsonl` (git-ignored): a line about once a second with the time
elapsed, the ETA and its range, which method made it, the rounds or pairs done and the games played, then a last line
with the actual total. Those logs are what the methods below were chosen and calibrated on.

1. **From history**, when an earlier run with the same settings (games, bots, openings, adaptive or not) finished from
   the start. Runs are seeded, so it played the very same games, and its slow and quick stretches fall in the same
   places. The ETA is that run's time still to go from the same number of games, scaled by how fast this run has gone so
   far.
2. **From rounds**, otherwise: the mean round time so far, leaving out the first round (the workers start and nothing is
   warmed up yet), for every round still to start, plus what's left of the current one.
3. **From costs**, for an adaptive run with no history: the planned cost still to play, at the rate so far.

Each comes with an **80% range**: the 10th to 90th percentile of what runs really took, as a share of the ETA.

| Method       | Mean miss | 80% range     | From                                           |
| ------------ | --------: | ------------- | ---------------------------------------------- |
| From history |       ~9% | 0.85× – 1.12× | 359 predictions, 3 runs with an earlier twin   |
| From rounds  |      ~34% | 0.69× – 1.33× | 637 predictions, 8 runs                        |
| From costs   |   unknown | 0.69× – 1.33× | no adaptive run logged yet: the wider band     |
| _Before_     |      ~43% | none          | the median of the last 5 rounds: 23% too short |

The old ETA ran short because round times are skewed: most rounds are quick and a few are very slow, so the mean round
is up to 2.35 times the median, and an ETA built on the median misses the slow ones.

**The progress line** reads `ETA 02:10 (01:50–02:40)`: the ETA, then the range. The dashboard shows the same.

## ETA 2.0: the roadmap

The aim: from history within ±5% (an 80% range of 0.95×–1.05×), without it within ±15%, and ranges that really hold the
finish four times in five. In order, cheapest and surest first:

### 1. Measure what we have (the yardstick)

- [ ] **`npm run eta-report`**: the backtest as a tool. For every log: each method's mean miss, its 80% range, and
      **coverage** (how often the real finish fell inside the range it showed). Coverage is the honest test of a range:
      80% shown should mean 80% held.
- [ ] **Log what the ETA can't see yet**: the machine (CPU cores, `--workers`), and whether the run was resumed or
      stopped. Today's logs miss the `--shared-openings` runs' flag, and three of them had to be dropped by hand.
- [ ] **Log adaptive runs**, so the "from costs" band gets real numbers instead of a borrowed one.

### 2. Ranges that narrow as the run goes

- [ ] **Bands by progress.** A miss of 30% at 10% done is far more time than at 90% done. Calibrate the band separately
      for each quarter of the run (or as a smooth function of the fraction done), so the range shrinks as the finish
      nears.
- [ ] **Check the range against this run as it goes** (online calibration). Every prediction made a minute ago can
      already be checked against what happened since; if this run's ETA has been running short, widen and shift the
      range for the rest of it.

### 3. A better guess with history

- [ ] **Recent pace, not the whole run's.** History scales by the pace since the start, so a machine that slows down
      (heat, other work, a laptop going to sleep) drags the ETA for the rest of the run. Scale by the pace over the last
      part of the run instead, compared like for like with the earlier run at the same stage.
- [ ] **Notice pauses.** When the clock jumps with no games played (the laptop slept), leave that gap out of the pace,
      and say "paused" instead of an ETA that's suddenly hours long.
- [ ] **Per-bot pace.** A change that speeds up one bot (Minimax, say) changes the shape of the run, not just its
      length. Log each pairing's time, compare each bot's speed with the earlier run's, and scale each pairing by its
      own bots.

### 4. A real guess without history

- [ ] **A cost model per pairing.** Each bot's time a move is in every run's results (`ms a move`, `data/elo-time.json`)
      and games run to a fairly steady length. So a pairing's time is roughly (moves a game) × (each bot's ms a move),
      known before the run starts. That gives an ETA from the first second, and replaces adaptive's hand-set `weight()`
      too.
- [ ] **Simulate the scheduler.** A round ends when its slowest pairing does, on whichever worker it's on. With each
      pairing's expected time, replay the slowest-first queue on the given number of workers: the round's length,
      stragglers included, rather than an average.

### 5. Exact, for repeated runs

- [ ] **Replay the earlier run job by job.** With every pairing's time logged, an identical run's remaining work is
      known pairing by pairing; simulating the queue with this run's pace gives an ETA that should land within a few
      percent, from the first round on.

Each step is kept only if `npm run eta-report` shows it narrowing the range at the same coverage, on runs it wasn't
tuned on.
