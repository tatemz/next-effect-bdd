# next-effect-bdd

A minimal Next.js app wrapped in a **standard Effect HTTP app server**, tested
end-to-end with [effect-bdd](https://github.com/tatemz/effect-bdd) Gherkin
scenarios.

```ts
const port = yield* createApp({ dev: false })
  .pipe(HttpRouter.provideRequest(Greeter.layerFor("es")), startApp(port));
```

The app is built entirely from Effect's own primitives: routes are
`HttpRouter.add` layers, request-scoped services come from
`HttpRouter.provideRequest`, serving is `HttpRouter.serve` over
`NodeHttpServer.layer`, and the entry point is the canonical
`Layer.unwrap` + `Layer.launch`. Next.js is just a service behind one
catch-all route: unmatched requests go to Next's request handler on the raw
Node req/res, and the services built by `provideRequest` are shared by both
worlds — Effect routes use them as ordinary services, and React Server
Components receive the same context through an `AsyncLocalStorage` bridge.

## The pieces

| Piece                                | Role                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| `HttpRouter.add(method, path, h)`    | an Effect route as a Layer (Effect, not ours)                      |
| `nextCatchAll`                       | the `"*"`/`"*"` route that delegates to the `NextJs` service        |
| `NextJs.layer(options)`              | service implementation: prepare Next, `render` requests, close     |
| `HttpRouter.provideRequest(layer)`   | build services once, inject into every request (Effect, not ours)  |
| `serveApp(port)` / `startApp(port)`  | `HttpRouter.serve` + `NodeHttpServer.layer`; `startApp` returns the bound port |

## Layout

| File                        | Role                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| `server.ts`                 | `EffectApp` type + `serveApp` / `startApp` (`HttpRouter.serve` over `NodeHttpServer`) |
| `next.ts`                   | `NextJs` service, its live `NextJs.layer`, and the `nextCatchAll` route  |
| `app.ts`                    | POC composition (health route + Next) + `node app.ts` entry              |
| `greeter.ts`                | `Greeter` service, the `Language` union, and `Greeter.layerFor`          |
| `deps.ts`                   | `AsyncLocalStorage` bridge from request fibers into page renders        |
| `app/page.tsx`              | Server component that runs `Greeter` against the request context        |
| `features/greeting.feature` | BDD feature: narrow scenarios for the page and the health check   |
| `features/greeting.steps.ts`| Inline step chains; the scenario state *is* the pipeline           |

## The features

```gherkin
Scenario Outline: The home page greets in the chosen language
  Given a POC app with the <language> greeter
  When the app is running
  Then the home page says <expected>

Scenario: The health check reports the configured greeter
  Given a POC app with the es greeter
  When the app is running
  Then the health check says status ok and greeting ¡Hola!
```

Each scenario makes one narrow claim about one surface: the outline covers
the Next-rendered HTML page per language, the single scenario covers the
Effect health route. Both run the full pipeline, so the health check also
proves the page and the route resolve the *same* `Greeter` instance built
once per app.

## Commands

```sh
pnpm install

pnpm build          # next build (required before start/tests)
pnpm start          # http://localhost:3456  (LANGUAGE=es pnpm start)
pnpm test-bdd       # effect-bdd: greeting feature (page outline + health check)
```

## Requirements

- Node ≥ 22.12 (native TS stripping runs `app.ts` directly)
- `effect@4.0.0-rc.117` + `@effect/platform-node@4.0.0-rc.117` —
  `effect-bdd` tracks the v4 release-candidate train
