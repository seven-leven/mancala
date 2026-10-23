# harness/

Measuring the bots. Nothing here ships in the game.

| Path                              | What it measures                                                            | Run                                |
| --------------------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| [rate/](rate/main.ts)             | The rating harness: every bot against every other, Elo with 90% ranges      | `npm run rate -- 240 --write --ui` |
| [dashboard/](dashboard/server.ts) | The live view of a rating run (`--ui`)                                      | with `npm run rate`                |
| [accuracy.ts](accuracy.ts)        | How often each bot plays a perfect move, on positions the solver can check  | `npm run accuracy -- 7 200`        |
| [bench.ts](bench.ts)              | How deep and fast Minimax searches                                          | `npm run bench`                    |
| [match.ts](match.ts)              | Bot-against-bot games, and the seeded random numbers everything here shares | imported                           |
| [ladder.ts](ladder.ts)            | Redraws docs/images/ladder.svg from the ratings                             | `npm run ladder`                   |

[docs/RATING.md](../docs/RATING.md) explains the ratings; [docs/TESTING.md](../docs/TESTING.md) the test harness
(`tests/`), which checks the code is correct rather than measuring the bots.
