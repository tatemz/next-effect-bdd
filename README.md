# next-effect-bdd

A minimal Next.js app wrapped in a **standard Effect HTTP app server**, tested
end-to-end with [effect-bdd](https://github.com/tatemz/effect-bdd) Gherkin
scenarios.

```ts
const port = yield* appFor("production")
  .pipe(HttpRouter.provideRequest(Greeter.layerFor("es")), startApp(port));
```

There are two apps and three ways to run them: the **Next app**
(`server/nextApp.ts`), the **Effect HTTP API app** (`server/apiApp.ts`), and
the **composed app** (`server/app.ts`), which is just `Layer.mergeAll` of
the two halves on one router. Each has its own entry point - `main.next.ts`,
`main.api.ts`, and the default `main.ts` respectively - and its own required
config.

The app is built entirely from Effect's own primitives: the HTTP API is a
schema-first `HttpApi` contract (`server/api.ts`) served through
`HttpApiBuilder`, which also generates the OpenAPI document at
`/openapi.json` and the Swagger UI at `/docs`; request-scoped services come
from `HttpRouter.provideRequest`, serving is `HttpRouter.serve` over
`NodeHttpServer.layer`, and the entry point is the canonical
`Layer.unwrap` + `Layer.launch`. The BDD steps drive the API through a typed
`HttpApiClient` generated from the same contract, so a server schema change
breaks the step code at compile time. Next.js is just a service behind one
catch-all route: unmatched requests go to Next's request handler on the raw
Node req/res, and the services built by `provideRequest` are shared by both
worlds — Effect routes use them as ordinary services, and React Server
Components receive the same context through an `AsyncLocalStorage` bridge.

Like `Greeter` speaks a closed union of languages, the app composes in a
closed union of modes: `appProduction` and `appDevelopment` are two explicit
compositions, and `appFor(mode)` is a total mapping between them - adding a
mode breaks the switch. There is no `dev` flag threading through
construction; in the development composition two extra routes claim Next's
HMR upgrade paths on the same router (the platform's `upgrade` listener runs
the router for socket requests, so those routes hand the raw socket to
Next's upgrade handler and live refresh works through the Effect server
unchanged), and in the production composition they were never built.

## The pieces

| Piece                                | Role                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| `HttpApi` / `HttpApiEndpoint`        | the schema-first API contract: server, OpenAPI docs, and typed client all derive from it |
| `HttpApiBuilder.layer(Api)`          | registers the API's routes on the router (+ `openapiPath` for the spec) |
| `HttpApiSwagger.layer(Api)`          | mounts Swagger UI on the router, rendered from the same spec         |
| `HttpApiClient.make(Api, { baseUrl })` | the typed client: methods per endpoint, Schema types on every channel |
| `HttpRouter.add(method, path, h)`    | an Effect route as a Layer (Effect, not ours)                      |
| `nextCatchAll`                       | the `"*"`/`"*"` route that delegates to the `NextJs` service        |
| `NextJs.layer(options)`              | service implementation: prepare Next, `render` requests, close     |
| `HttpRouter.provideRequest(layer)`   | build services once, inject into every request (Effect, not ours)  |
| `serveApp(port)` / `startApp(port)`  | `HttpRouter.serve` + `NodeHttpServer.layer`; `startApp` returns the bound port |
| `appFor(mode)`                       | total `Mode` union -> composition mapping, like `Greeter.layerFor`  |

## Layout

Boundaries follow the Effect repo's `domain` / `server` separation (see its
ai-docs fixtures): domain models know nothing about HTTP, server code owns
infrastructure, and `app/` is Next's routing surface.

```text
domain/greeter.ts      Greeter service, the Language union, Greeter.layerFor
server/api.ts          the typed Api contract: HttpApi + handlers + client type
server/apiApp.ts       the standalone API app: Api routes + Swagger UI + ApiAppConfig
server/nextApp.ts      the standalone Next app: Mode union, nextFor, NextAppConfig, HMR routes
server/deps.ts         AsyncLocalStorage bridge from request fibers into page renders
server/next.ts         NextJs service, its live NextJs.layer, and the nextCatchAll route
server/pipeline.ts     EffectApp type + serveApp / startApp (HttpRouter.serve over NodeHttpServer)
server/app.ts          the composed app: mergeAll(apiApp, nextFor(mode)) + AppConfig
main.ts                default entry point: the composed app
main.next.ts           entry point: Next only (no /health, no /docs)
main.api.ts            entry point: the Effect API only (no Next server boots)
app/page.tsx           Next server component; runs Greeter against the request context
features/              greeting feature: narrow outlines, one per surface
```

Dependencies point one way: `app/` and `features/` -> `server/` -> `domain/`.

## The features

```gherkin
Scenario Outline: The home page greets in the chosen language
  Given a POC app with the <language> greeter
  When the app is running
  Then the home page says <expected>

Scenario Outline: The health check reports the configured greeter
  Given a POC app with the <language> greeter
  When the app is running
  Then the health check says status ok and greeting <expected>

Scenario Outline: The docs endpoint describes the API
  Given a POC app with the <language> greeter
  When the app is running
  Then the swagger docs and openapi document are served
```

Each scenario makes one narrow claim about one surface: one outline covers
the Next-rendered HTML page per language, the other two cover the typed API
and its docs. Both run the full pipeline, so the health check also proves the
page and the API handler resolve the *same* `Greeter` instance built once per
app. The health step calls the API through the `HttpApiClient` generated from
`server/api.ts` (`state.api.health()`), not a raw fetch: the response is
Schema-decoded, and field or contract drift is a compile error.

## Commands

```sh
pnpm install

pnpm build          # next build (required before start/tests)

# The default composed app; :next / :api run the standalone variants.
pnpm dev            # development composition with live refresh (HMR):
pnpm dev:next       #   MODE, LANGUAGE, and PORT come from the script env;
pnpm dev:api        #   no build is required for any of them.

pnpm start          # nothing is defaulted: PORT, LANGUAGE, and MODE are required,
pnpm start:next     #   e.g. PORT=3456 LANGUAGE=en MODE=production pnpm start
pnpm start:api      #   (the API app needs only PORT and LANGUAGE: it has no mode)

pnpm test-bdd       # effect-bdd: greeting feature (page + api + docs outlines)
```

## Docker production

The multistage image builds with `node:24-alpine3.24`. Its final stage copies
a cleaned Node/Alpine filesystem into `scratch`, retaining the matching system
libraries, CA certificates, and non-root user without npm, pnpm, or Yarn in
any runtime layer. It runs the custom Effect server in `main.ts`, not Next.js
standalone output (incompatible with this custom server). The build uses pnpm
`11.22.0` with a frozen lockfile; runtime files are selected using `@vercel/nft` for the custom server and Next.js `.nft`
trace manifests, keeping build dependencies and build caches out of the
runtime image.

```sh
docker build -t next-effect-bdd .
docker run --rm --name next-effect-bdd -p 3000:3000 --stop-timeout 30 next-effect-bdd
```

From another terminal, check the health endpoint, the docs, and the home page:

```sh
curl --fail http://localhost:3000/health
curl --fail http://localhost:3000/docs          # Swagger UI
curl --fail http://localhost:3000/openapi.json  # the OpenAPI document
curl --fail http://localhost:3000/
```

Defaults are `PORT=3000`, `LANGUAGE=en`, `MODE=production`,
`NODE_ENV=production`, and `NEXT_TELEMETRY_DISABLED=1`. Override configuration
with runtime environment variables; changing `PORT` requires a matching
container port in the mapping. For example, to use Spanish on port 8080:

```sh
docker run --rm --name next-effect-bdd -e PORT=8080 -e LANGUAGE=es -p 8080:8080 --stop-timeout 30 next-effect-bdd
```

The container runs as non-root `node` (UID 1000), with writable `.next/cache`,
and uses `/health` for its healthcheck. Node runs directly via exec, preserving
Effect's SIGTERM graceful shutdown; `--stop-timeout 30` allows 30 seconds
before Docker forces termination. Effect reports a normal interruption with exit
code 130. Keep any mounted `.next/cache` writable by UID 1000. Use a reverse proxy for TLS in production. Never bake secrets into
the image or pass them at build time; supply them only through runtime
environment variables.

To smoke-test a built image (requires Node 24 and Docker):

```sh
node scripts/smoke-docker.mjs next-effect-bdd
```

This checks the English greeting, Next page and static assets, 404 responses,
non-root permissions, Docker health status, and graceful shutdown. It removes
its temporary container when finished.

## Requirements

- Node ≥ 22.12 (native TS stripping runs `main.ts` directly)
- `effect@4.0.0-rc.117` + `@effect/platform-node@4.0.0-rc.117` —
  `effect-bdd` tracks the v4 release-candidate train
- `typescript@7` (native compiler) + `@effect/tsgo` — `pnpm exec tsc --noEmit`
  also reports Effect-specific diagnostics from the language service
