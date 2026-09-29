import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer, Match } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { Incrementer } from "./domain/incrementer.ts";
import { AppConfig, Mode } from "./server/config.ts";
import { layerDev, layerProd } from "./server/nextApp.ts";
import { serveApp } from "./server/pipeline.ts";

/**
 * The Next-only entry point: pages through the Effect server, no API.
 *
 * Reads `AppConfig` from the environment, chooses the Next composition the
 * mode names, provides the configured `Greeter` and its `greeting-count`
 * `Incrementer`, then launches the served app until interrupted. No API
 * routes (`/health`, `/docs`) exist here; unmatched routes render through
 * Next.
 *
 * @example
 * // Build first (next build), then serve on the configured port:
 * //   MODE=production PORT=3456 LANGUAGE=en node main.next.ts
 * //   # or simply:
 * //   pnpm start:next
 * // http://localhost:3456 renders through Next only.
 */
if (import.meta.main) {
  // Next-only entry point: pages render through the Effect server and no
  // API routes (/health, /docs) exist. Build from config, then launch.
  const AppLayer = Layer.unwrap(
    Effect.gen(function* () {
      const { mode, language, port } = yield* AppConfig;
      // The entry point is where MODE becomes a choice, made exhaustively:
      // a new mode without a branch here is a compile error.
      const next = Match.value(mode).pipe(
        Match.when(Mode.Production, () => layerProd),
        Match.when(Mode.Development, () => layerDev()),
        Match.exhaustive,
      );
      // Composition root: wire the greeter's "greeting-count" Incrementer.
      // provideMerge keeps the counter in the request context too, so page
      // renders read the very instance the greeter bumps.
      const greeter = Layer.provideMerge(
        Greeter.layerFor(language),
        Incrementer.greetingCountLayer,
      );
      const appWithGreeter = HttpRouter.provideRequest(greeter)(next);
      return serveApp(port)(appWithGreeter);
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
