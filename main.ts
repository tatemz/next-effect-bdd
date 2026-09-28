import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { Incrementer } from "./domain/incrementer.ts";
import { AppConfig, appFor } from "./server/app.ts";
import { serveApp } from "./server/pipeline.ts";

/**
 * The default entry point: the Next app and the Effect HTTP API on one
 * router.
 *
 * Reads `AppConfig` from the environment, composes `appFor(mode)` with the
 * configured `Greeter` and its `greeting-count` `Incrementer`, then launches
 * the served app until interrupted.
 *
 * @example
 * // Build first (next build), then serve on the configured port:
 * //   MODE=production PORT=3456 LANGUAGE=en node main.ts
 * //   # or simply:
 * //   pnpm start
 * // http://localhost:3456 renders through Next; /health and /docs are API.
 */
if (import.meta.main) {
  // The default entry point: the Next app and the Effect HTTP API composed
  // on one router. Build from config, then launch until interrupted.
  const AppLayer = Layer.unwrap(
    Effect.gen(function* () {
      const { mode, language, port } = yield* AppConfig;
      // This is the composition root, so it owns the wiring the domain
      // leaves open: the greeter's "greeting-count" Incrementer.
      // provideMerge keeps the counter in the request context too, so page
      // renders read the very instance the greeter bumps.
      const greeter = Layer.provideMerge(
        Greeter.layerFor(language),
        Incrementer.greetingCountLayer,
      );
      const appWithGreeter = HttpRouter.provideRequest(greeter)(appFor(mode));
      return serveApp(port)(appWithGreeter);
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
