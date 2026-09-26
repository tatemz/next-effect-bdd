import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { AppConfig, createApp } from "./server/app.ts";
import { serveApp } from "./server/pipeline.ts";

if (import.meta.main) {
  // Build the app from its configuration, then launch it until interrupted.
  const AppLayer = Layer.unwrap(
    Effect.gen(function* () {
      const { language, port } = yield* AppConfig;
      return createApp({ dev: false })
        .pipe(HttpRouter.provideRequest(Greeter.layerFor(language)), serveApp(port));
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
