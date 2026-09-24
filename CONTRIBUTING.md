# Contributing to Territorium

Thanks for your interest in Territorium! It is a fork of
[OpenFront.io](https://github.com/openfrontio/OpenFrontIO), licensed under the
GNU AGPL v3 (see [LICENSING.md](LICENSING.md)).

## Reporting a bug or suggesting a feature

Open an [issue](https://github.com/BroussenDev/Territorium/issues) with the
bug report or feature request template. For a bug, include the version shown
in the game's footer and the steps to reproduce it.

Security issues (accounts, cheating, server exploits): please do **not** open
a public issue. Contact the maintainer privately instead.

## Sending a pull request

1. Discuss anything bigger than a small fix in an issue first.
2. Keep pull requests small and focused on one change.
3. Run `npm run lint` and `npm test` before opening it.
4. Changes to `src/core` (the deterministic simulation) must come with tests.
5. User-visible text goes through `translateText()`, with the English string
   added to `resources/lang/en.json` only.

By contributing, you agree that your code is released under the AGPL v3 and
your assets under CC BY-SA 4.0, like the rest of the project.

## Development setup

```bash
npm run inst # install dependencies (npm ci --ignore-scripts)
npm run dev  # client + server with hot reload, on http://localhost:9000
npm test
```

See [docs/Architecture.md](docs/Architecture.md) for how the client, the
server and the simulation fit together.
