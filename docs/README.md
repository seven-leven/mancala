# Docs

The guides behind the game, by what you're about to do. The [README](../README.md) is the way in: how to play, the bots'
ratings, and how the site is built.

## Changing how it looks

- [Design guide](DESIGN.md): the colours, type, icons, motion and sound, and why. Read it before changing the interface.
- [The design guide as one page](design-guide.html): the same, drawn as a sheet; `npm run design-sheet` renders it to
  [images/design-guide.png](images/design-guide.png).

## Adding or rating a bot

- [Bot standard](BOTS.md): how a bot is built, named and kept.
- [Rating the bots](RATING.md): how the bots get their Elo, how to run a rating, and how to read it.
- [Game notation (MGN)](NOTATION.md): one game as plain text, as the tournament writes it.

## Changing the code

- [Testing](TESTING.md): what the tests check, how to run them, and what belongs elsewhere.

## Images

[images/](images/) holds the pictures these pages and the README show. Some are drawn by tools, so redraw them rather
than editing them:

| Image                                                                                                  | Drawn by                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------- |
| [ladder.svg](images/ladder.svg)                                                                        | `npm run ladder`            |
| [icons.png](images/icons.png)                                                                          | `npm run icon-sheet`        |
| [design-guide.png](images/design-guide.png)                                                            | `npm run design-sheet`      |
| [rating-session.svg](images/rating-session.svg), [rating-reading.svg](images/rating-reading.svg)       | by hand                     |
| [screenshot-light.png](images/screenshot-light.png), [screenshot-dark.png](images/screenshot-dark.png) | by hand, from `npm run dev` |
