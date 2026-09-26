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
| `features/homepage.feature` | BDD feature: greeter language flows through the pipeline                |
| `features/health.feature`   | BDD feature: `/health` and the page share one greeter instance          |
| `features/*.steps.ts`       | Inline step chains; the scenario state *is* the pipeline                |

## The features

```gherkin
Scenario Outline: Greeting visitors
  Given the app is ready to start
  Given the greeter is in <language>
  When the app is running
  Then the home page says <expected>
```

```gherkin
Scenario: The health endpoint greets with the app's greeter
  Given a POC app with a counting greeter
  When the app starts listening
  Then the health check says status ok and greeting Hello #1!
  And the home page says Hello #2!
```

The health scenario uses a `Greeter` that counts greetings in a `Ref`: the
route must see `Hello #1!` and the page `Hello #2!`, which proves the Effect
endpoint and the Next page render through the *same* service instance.

## Commands

```sh
pnpm install

pnpm build          # next build (required before start/tests)
pnpm start          # http://localhost:3456  (LANGUAGE=es pnpm start)
pnpm test-bdd       # effect-bdd: homepage outline (en/es) + health scenario
```

## Requirements

- Node ≥ 22.12 (native TS stripping runs `app.ts` directly)
- `effect@4.0.0-rc.117` + `@effect/platform-node@4.0.0-rc.117` —
  `effect-bdd` tracks the v4 release-candidate train
