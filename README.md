# next-effect-bdd

A minimal Next.js app with a **custom server driven by an Effect pipeline**,
tested end-to-end with [effect-bdd](https://github.com/tatemz/effect-bdd)
Gherkin scenarios.

```ts
const port = yield* pipe(makeApp(port), provideDeps(GreeterEnglish), start);
```

Next's own API (`Next()` → `prepare()` → `listen()`) is imperative and gives
pages no way to receive an Effect context. Because a custom server owns the
process, this repo wraps each stage in a scoped `Effect` and bridges the
render-time context with `AsyncLocalStorage`.

## Layout

| File                        | Role                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `app.ts`                    | `makeApp` / `provideDeps` / `start` pipeline + `node app.ts` entry      |
| `greeter.ts`                | `Greeter` service with distinct `GreeterEnglish` / `GreeterSpanish` layers |
| `deps.ts`                   | `AsyncLocalStorage` bridge from the pipeline into page renders          |
| `app/page.tsx`              | Server component that runs `Greeter` against the request context        |
| `features/homepage.feature` | The BDD feature                                                         |
| `features/homepage.steps.ts`| Typed step chains; the scenario state *is* the pipeline                 |

## The feature

```gherkin
Scenario Outline: Greeting visitors
  Given the app is ready to start
  Given the greeter is in <language>
  When the app is running
  Then the home page says <expected>
```

Each Gherkin step maps to a stage of the pipeline:

- **ready to start** → `makeApp(0)` — prepared Next app, nothing listening.
- **greeter is in `en`/`es`** → picks `GreeterEnglish` vs `GreeterSpanish`; the
  language is a *layer choice*, not a runtime argument.
- **app is running** → `pipe(make, provide, start)` inside the step's scope, so
  effect-bdd tears the server down when the scenario ends.
- **home page says …** → fetches the page and asserts the `<main>` contents.

## Commands

```sh
npm install

npm run build          # next build (required before start/tests)
npm start              # http://localhost:3456  (LANGUAGE=es npm start)
npm run test-bdd       # effect-bdd, en + es scenarios
```

## Requirements

- Node ≥ 22.12 (native TS stripping runs `app.ts` directly)
- `effect@4.0.0-rc.117` — `effect-bdd` tracks the v4 release-candidate train
