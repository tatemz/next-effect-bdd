import { Config, Layer, Match } from "effect";
import { Language } from "../domain/greeter.ts";
import { apiApp } from "./apiApp.ts";
import { Mode, nextDevelopment, nextProduction } from "./nextApp.ts";

/**
 * The combined app: the typed Effect API and the Next.js app sharing one
 * router. Each half is an independent composition (`server/apiApp.ts`,
 * `server/nextApp.ts`); combining them here adds nothing new - the API
 * routes and the Next catch-all simply register on the same `HttpRouter`.
 *
 * Both halves still require a `Greeter` per request (the API handler and the
 * page renders resolve the same instance) and leave it for the caller to
 * provide with `HttpRouter.provideRequest`.
 */
export const appProduction = Layer.mergeAll(apiApp, nextProduction);

/**
 * The combined app in development: the API plus the Next app with its HMR
 * upgrade paths and a dev-mode Next server.
 */
export const appDevelopment = Layer.mergeAll(apiApp, nextDevelopment);

/**
 * Total mapping from the `Mode` union to a combined composition - the same
 * shape as `Greeter.layerFor` and `nextFor`. `Match.exhaustive` forces a
 * branch for every mode at compile time, and there is no mode in between
 * the two.
 *
 * @example
 * import { Layer } from "effect";
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { serveApp } from "./pipeline.ts";
 * import { appFor } from "./app.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor("en"))(appFor("production"));
 * Layer.launch(serveApp(3456)(app));
 * // /health, /docs, and /openapi.json come from the API half; everything
 * // else renders through Next.
 */
export const appFor = (mode: Mode) =>
  Match.value(mode).pipe(
    Match.when("production", () => appProduction),
    Match.when("development", () => appDevelopment),
    Match.exhaustive,
  );

/**
 * Required runtime configuration, read from the Config provider.
 *
 * Nothing is defaulted: a missing `PORT`, `LANGUAGE`, or `MODE` fails at
 * startup with a typed `ConfigError`, as do invalid values (`NaN` ports,
 * misspelled languages, and modes outside the union are unrepresentable).
 * `pnpm start` therefore needs all three set.
 *
 * @example
 * import { Effect } from "effect";
 * import { AppConfig } from "./app.ts";
 *
 * // With PORT=3456 LANGUAGE=en MODE=production in the environment:
 * Effect.runSync(AppConfig); // { mode: "production", language: "en", port: 3456 }
 */
export const AppConfig = Config.all({
  mode: Config.schema(Mode, "MODE"),
  language: Config.schema(Language, "LANGUAGE"),
  port: Config.Port("PORT"),
});
