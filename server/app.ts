import { Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { Greeter, Language } from "../domain/greeter.ts";
import { NextJs, nextCatchAll, type NextOptions } from "./next.ts";

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
    greeting: yield* greeter.greet,
  });
});

/** This app's routes: the Effect health route, with Next.js catching everything else. */
export const createApp = (options: NextOptions) =>
  Layer.mergeAll(
    HttpRouter.add("GET", "/health", healthRoute),
    nextCatchAll,
  ).pipe(HttpRouter.provideRequest(NextJs.layer(options)));

/**
 * Required runtime configuration, read from the Config provider. Nothing
 * is defaulted: a missing `PORT` or `LANGUAGE` fails at startup with a
 * typed `ConfigError`, as do invalid values (`NaN` ports and misspelled
 * languages are unrepresentable). `pnpm start` therefore needs both set,
 * e.g. `PORT=3456 LANGUAGE=en pnpm start`.
 */
export const AppConfig = Config.all({
  port: Config.Port("PORT"),
  language: Config.schema(Language, "LANGUAGE"),
});
