import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { Incrementer } from "./domain/incrementer.ts";
import { NextAppConfig, nextFor } from "./server/nextApp.ts";
import { serveApp } from "./server/pipeline.ts";

if (import.meta.main) {
  // Next-only entry point: pages render through the Effect server and no
  // API routes (/health, /docs) exist. Build from config, then launch.
  const AppLayer = Layer.unwrap(
    Effect.gen(function* () {
      const { mode, language, port } = yield* NextAppConfig;
      // Composition root: wire the greeter's "greeting-count" Incrementer.
      // provideMerge keeps the counter in the request context too, so page
      // renders read the very instance the greeter bumps.
      const greeter = Layer.provideMerge(
        Greeter.layerFor(language),
        Incrementer.greetingCountLayer,
      );
      const appWithGreeter = HttpRouter.provideRequest(greeter)(nextFor(mode));
      return serveApp(port)(appWithGreeter);
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
