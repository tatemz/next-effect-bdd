import { NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { Greeter, Language } from "./greeter.ts";
import { NextJs, nextCatchAll, type NextOptions } from "./next.ts";
import { serveApp } from "./server.ts";

const HealthResponse = Schema.Struct({
  status: Schema.tag("ok"),
  greeting: Schema.String,
});

/**
 * The POC Effect endpoint. It greets through the `Greeter` the pipeline
 * provided - the same instance Next pages render with.
 */
const healthRoute = Effect.fn("App.healthRoute")(function* () {
  const greeter = yield* Greeter;
  return yield* HttpServerResponse.schemaJson(HealthResponse)({
    status: "ok",
    greeting: yield* greeter.greet(),
  });
});

/** This app's routes: the Effect health route, with Next.js catching everything else. */
export const createApp = (options: NextOptions) =>
  Layer.mergeAll(
    HttpRouter.add("GET", "/health", healthRoute),
    nextCatchAll,
  ).pipe(HttpRouter.provideRequest(NextJs.layer(options)));

/**
 * Explicit fallbacks, passed by reference into the config pipeline. A
 * fallback only applies when the variable is absent; invalid values still
 * fail with a typed `ConfigError`, so `NaN` ports and misspelled languages
 * remain unrepresentable.
 */
const AppConfigDefaults = {
  port: 3456,
  language: "en",
} as const satisfies { readonly port: number; readonly language: Language };

export const AppConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(AppConfigDefaults.port)),
  language: Config.schema(Language, "LANGUAGE").pipe(
    Config.withDefault(AppConfigDefaults.language),
  ),
});

if (import.meta.main) {
  // Build the app from its configuration, then launch it until interrupted.
  const AppLayer = Layer.unwrap(
    Effect.map(AppConfig, ({ language, port }) =>
      createApp({ dev: false })
        .pipe(HttpRouter.provideRequest(Greeter.layerFor(language)), serveApp(port))),
  );
  Layer.launch(AppLayer).pipe(NodeRuntime.runMain);
}
