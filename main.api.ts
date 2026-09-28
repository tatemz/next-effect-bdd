import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { Incrementer } from "./domain/incrementer.ts";
import { ApiAppConfig, apiApp } from "./server/apiApp.ts";
import { serveApp } from "./server/pipeline.ts";

/**
 * The API-only entry point: the typed `Api`, `/docs`, and `/openapi.json`
 * with no Next server.
 *
 * Reads `ApiAppConfig` from the environment, provides the configured
 * `Greeter` and its `greeting-count` `Incrementer` per request, then
 * launches the served app until interrupted. Unmatched routes 404; the API
 * has no mode, it is the same app serving either way.
 *
 * @example
 * // No next build needed; serve the API alone:
 * //   PORT=3457 LANGUAGE=en node main.api.ts
 * //   # or simply:
 * //   pnpm start:api
 * // http://localhost:3457/health answers with the configured greeting.
 */
if (import.meta.main) {
  // API-only entry point: the typed Api, /docs, and /openapi.json, with no
  // Next server booted and no page renders. Unmatched routes 404. The API
  // has no mode: it is the same app serving either way.
  const AppLayer = Layer.unwrap(
    Effect.gen(function* () {
      const { language, port } = yield* ApiAppConfig;
      // Composition root: wire the greeter's "greeting-count" Incrementer.
      // provideMerge keeps the counter in the request context too, so a
      // handler could read the very instance the greeter bumps.
      const greeter = Layer.provideMerge(
        Greeter.layerFor(language),
        Incrementer.greetingCountLayer,
      );
      const appWithGreeter = HttpRouter.provideRequest(greeter)(apiApp);
      return serveApp(port)(appWithGreeter);
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
