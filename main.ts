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
      const { dev, language, port } = yield* AppConfig;
      const app = createApp({ dev });
      const appWithGreeter = HttpRouter.provideRequest(Greeter.layerFor(language))(app);
      return serveApp(port)(appWithGreeter);
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
