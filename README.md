# next-effect-bdd

> **This repository is a proof of concept** for wiring Effect and Next.js
> together. The wiring, seams, and tests are the deliverable; the `Greeter`
> feature driving them is deliberately trivial.

The question: can a Next.js app run **inside a standard Effect HTTP server** —
one router, one runtime, one request context? The answer demonstrated here is
yes:

```ts
const port = yield* appFor("production")
  .pipe(HttpRouter.provideRequest(Greeter.layerFor("es")), startApp(port));
```

```mermaid
sequenceDiagram
    participant C as HTTP client
    participant R as Effect HttpRouter
    participant A as HttpApi routes
    participant N as Next catch-all

    Note over R: main.api.ts: apiApp only
    Note over R: main.next.ts: nextFor(mode) only
    Note over R: main.ts: mergeAll(apiApp, nextFor(mode))

    C->>R: GET /health, /docs
    R->>A: matched
    A-->>C: schema-typed response
    C->>R: GET / (unmatched)
    R->>N: catch-all "*"
    N-->>C: Next-rendered page
```

## What the POC proves

- **One server, two frameworks.** Effect's `HttpRouter` owns the Node HTTP
  server; Next.js is a service mounted at `"*"`, and HMR socket upgrades are
  routed through the same router so live refresh works.
- **One request context for both worlds.** Services from
  `HttpRouter.provideRequest` are visible to Effect handlers and — through an
  `AsyncLocalStorage` bridge — to React Server Components and server actions.
- **One contract, three consumers.** Handlers, OpenAPI/Swagger, and the BDD
  test client all derive from the same schema-first `HttpApi`
  (`server/api.ts`), so drift is a compile error.
- **A total mode model.** `appFor(mode)` maps a closed `Mode` union to
  explicit compositions; adding a mode breaks the switch instead of silently
  misbehaving.

There are three entry points: `main.next.ts` (Next only), `main.api.ts`
(Effect API only), and the default `main.ts`, which composes both halves on
one router with `Layer.mergeAll`.

## Layout

Dependencies point one way: `app/` and `features/` → `server/` → `domain/`.

```text
domain/greeter.ts      Greeter service, the Language union, Greeter.layerFor
server/api.ts          the typed Api contract: HttpApi + handlers + client type
server/apiApp.ts       standalone API app: Api routes + Swagger UI + config
server/nextApp.ts      standalone Next app: Mode union, nextFor, config, HMR routes
server/deps.ts         AsyncLocalStorage bridge from request fibers into renders
server/next.ts         NextJs service and the nextCatchAll route
server/pipeline.ts     serveApp / startApp (HttpRouter.serve over NodeHttpServer)
server/app.ts          the composed app: mergeAll(apiApp, nextFor(mode))
app/page.tsx           Next server component; runs Greeter against the request context
features/              Gherkin features + steps (effect-bdd, Playwright)
```

## Features

The [effect-bdd](https://github.com/tatemz/effect-bdd) scenarios each make
one narrow claim: the Next-rendered page greets per language, the typed
`/health` API reports the same greeting (called through the generated
`HttpApiClient`, not a raw fetch), and `/docs` + `/openapi.json` are served.
A Playwright scenario proves the shared context: page view, health hit, and
server action all read the *same* `Incrementer` instance.

## Commands

```sh
pnpm install
pnpm build          # next build (required before start/tests)

pnpm dev            # composed app, with HMR; :next / :api run the variants
pnpm start          # production; start:next / start:api for the variants

pnpm test-bdd       # effect-bdd scenarios (run once beforehand:
                    #   pnpm exec playwright install chromium)
```

`dev` scripts carry their own env; `start` respects `PORT`, `LANGUAGE`, and
`MODE` from the environment (the API variant needs only `PORT` and
`LANGUAGE`).

## Docker

```sh
docker build -t next-effect-bdd .
docker run -d --name next-effect-bdd -p 3000:3000 --stop-timeout 30 next-effect-bdd
curl --fail http://localhost:3000/health
```

A multistage image (`node:24-alpine3.24`, digest-pinned, non-root) runs
`main.ts` as PID 1, keeping Effect's graceful SIGTERM shutdown. Defaults are
`MODE=production`, `PORT=3000`, `LANGUAGE=en`; override with `docker run -e`
(changing `PORT` requires a matching port mapping). Next.js standalone output
is incompatible with this custom server, so the image ships the full
production dependency tree and the `.next` build.

## Requirements

- Node ≥ 22.12 (native TS stripping runs `main.ts` directly)
- `effect` + `@effect/platform-node` `4.0.0-rc.117` (`effect-bdd` tracks the
  v4 release-candidate train)
- `typescript@7` + `@effect/tsgo` — `pnpm exec tsc --noEmit` also reports
  Effect-specific diagnostics
- `playwright` (dev-only) — run `pnpm exec playwright install chromium` once
