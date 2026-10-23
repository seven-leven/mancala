# lab/

Experiments: code that finds things out. What an experiment found goes in the [CHANGELOG](../CHANGELOG.md) (if it
shipped), [TODO.md](../TODO.md) (if it leads somewhere) or [research/](../research/README.md) (if it's worth a post).

| Path                          | What                                                                                       | Run                        |
| ----------------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| [learn/](learn/train.ts)      | The learned bots: training data, training, and reading the nets back as formulas and rules | `node lab/learn/<file>.ts` |
| [solve/](solve/solver.ts)     | The game solved on small boards, on several cores, across the 10×10 grid of board sizes    | `npm run solve`            |
| [diagrams/](diagrams/main.ts) | The charts and diagrams in docs/images/ (all but the ladder and the sheets)                | `npm run diagrams`         |
| [results/](results/)          | Small results worth keeping, so every chart can be redrawn: the solved boards              |                            |

Large or quick-to-remake data (training positions, saved memos, logs) goes in `data/`, which git ignores.
