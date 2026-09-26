import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { Greeter } from "./domain/greeter.ts";
import { ApiAppConfig, apiApp } from "./server/apiApp.ts";
import { serveApp } from "./server/pipeline.ts";

if (import.meta.main) {
  // API-only entry point: the typed Api, /docs, and /openapi.json, with no
  // Next server booted and no page renders. Unmatched routes 404. The API
  // has no mode: it is the same app serving either way.
  const AppLayer = Layer.unwrap(
    Effect.gen(function* () {
      const { language, port } = yield* ApiAppConfig;
      const appWithGreeter = HttpRouter.provideRequest(Greeter.layerFor(language))(apiApp);
      return serveApp(port)(appWithGreeter);
    }),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
