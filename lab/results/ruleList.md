# Rule list (`ruleList`)

Follows a short list of if/then rules, taken from Intuition's network.

- **Decides:** `one-move`; **judges:** `formula`
- **Status:** candidate: Waiting for a full rating: a 120-game placement run put it near 1680, between Planner and
  Lookahead.
- **Level:** Methodical

## Speed

| Where                                   | ms a move |
| --------------------------------------- | --------: |
| Early in the game (the first ten moves) |      0.07 |
| Later (the positions below)             |      0.01 |

## Against perfect play (100 solved positions, standard board)

Perfect: its move keeps the position's value. Gives up: final-margin seeds lost against perfect play, on average.

| Bot              | Perfect | Gives up |
| ---------------- | ------: | -------: |
| **Rule list**    |   58.0% |     2.94 |
| Minimax (Expert) |   84.0% |     0.52 |
| Greedy           |   39.0% |     6.86 |

## Placement (60 games a pairing, Random and bots across the ladder)

**1658** (90% range 1588–1757), between Greedy and Monte Carlo.

| Bot              |      Elo | 90% range |
| ---------------- | -------: | :-------: |
| Minimax          |     2040 | 1959–2147 |
| Monte Carlo      |     1755 | 1687–1850 |
| **Rule list**    | **1658** | 1588–1757 |
| Greedy           |     1278 | 1222–1353 |
| Random           |     1000 |  anchor   |
| Hoarder          |      975 | 912–1039  |
| Learned pushover |      527 |  442–594  |

_`npm run eval -- ruleList`, 2026-10-23._
