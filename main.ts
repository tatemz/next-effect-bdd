import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { Incrementer } from "./domain/incrementer.ts";
import { AppConfig, appFor } from "./server/app.ts";
import { serveApp } from "./server/pipeline.ts";

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
