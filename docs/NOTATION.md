# Game notation (MGN)

One game as plain text, like chess's PGN: tags, then the moves. The tournament writes every game it plays in it, and
`deno task positions` turns games into training data for the evaluation. The code is
[src/game/notation.ts](../src/game/notation.ts). Here is a tournament game, Random against Greedy, opening with two
random moves:

```
[Event "Tournament"]
[Opening "random-moves"]
[Round "1"]
[P1 "random"]
[P2 "greedy"]
[Rules "seeds=7 capture=own clinch=on"]
[First "1"]
[Result "38-60"]

1. 3x 1+ 6x 2. 7+ 7+ 2x 4x 3. 6x 7x 4. 5 6x 5. 1x 7 6. 5x 1x 7. 4x 7x 8. 2x 4x
38-60
```

## Moves

- **A move is the pit played, 1 to 7, counted from the mover's own left.** That's the same number as the keyboard key,
  and it reads the same from either seat: Player 1's pit 1 is the bottom-left pit, Player 2's is the top-right one.
- **`+`** after a move: a free turn. The last seed landed in the mover's store, so the same player moves next.
- **`x`** after a move: a capture. The last seed landed in an empty pit and banked the pit opposite.
- **`1.`, `2.`...** number the first player's turns, for reading. A turn is a player's moves until the other player
  moves, so in `2. 7+ 7+ 2x 4x` Player 1 plays three moves in a row (two free turns, then a capture) and Player 2
  replies with one. Parsers ignore the numbers: who moves is always known from the `+` marks.
- The score at the end (`38-60`, Player 1 first) closes a finished game.

## Tags

| Tag       | Meaning                                                                                 | Default            |
| --------- | --------------------------------------------------------------------------------------- | ------------------ |
| `P1`/`P2` | Who sat on each side: a bot id from `BOTS`, or `human`                                  | none               |
| `Rules`   | `seeds=N capture=own\|any clinch=on\|off`                                               | the standard rules |
| `First`   | `1` or `2`: who moved first                                                             | `1`                |
| `Start`   | A board other than the standard one: each side's pits from its own left, `a b c \| ...` | the standard board |
| `Result`  | The final stores, Player 1's first; only on finished games                              | none               |
| others    | Anything else (`Event`, `Date`, `Round`, `Opening`) is kept as it is                    |                    |

## Checked both ways

Formatting and parsing both replay the moves through the engine. A move that isn't legal, or whose `+` and `x` don't
match what it actually did, is refused, so a file that parses is a real game.

## Training data

```sh
deno task rate 40 --record data/games.mgn
deno task positions data/games.mgn > data/positions.jsonl
```

Each line of `positions.jsonl` is one position before a move:
`{"game":0,"ply":12,"pits":[...],"toMove":1,"result":1,"margin":18}`. `result` is 1 if the player to move went on to win
(½ a draw, 0 a loss), and `margin` the final store difference from their side. That's what tuning the evaluation needs
(Texel's method, [#15](https://github.com/seven-leven/mancala/issues/15)): weights that make the evaluation of each
position predict its result. `data/` is git-ignored.
