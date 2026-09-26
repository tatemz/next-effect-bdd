import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { NextAppConfig, nextFor } from "./server/nextApp.ts";
import { serveApp } from "./server/pipeline.ts";

if (import.meta.main) {
  // Next-only entry point: pages render through the Effect server and no
  // API routes (/health, /docs) exist. Build from config, then launch.
  const AppLayer = Layer.unwrap(
    Effect.gen(function* () {
      const { mode, language, port } = yield* NextAppConfig;
      const appWithGreeter = HttpRouter.provideRequest(Greeter.layerFor(language))(nextFor(mode));
      return serveApp(port)(appWithGreeter);
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
