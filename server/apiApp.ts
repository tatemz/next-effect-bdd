import { Config, Layer, Schema } from "effect";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";
import { Language } from "../domain/greeter.ts";
import { Api, HealthHandlers } from "./api.ts";

/**
 * The standalone Effect HTTP API app: routes only, with nothing Next.js on
 * its imports. It registers the typed `Api` (whose `health` handler greets
 * through the request-scoped `Greeter` the caller provides), the OpenAPI
 * document at `/openapi.json`, and the Swagger UI at `/docs` rendered from
 * that same document.
 *
 * Requires a `HttpRouter` to register on and a `Greeter` per request; it
 * composes alone (`main.api.ts`) or alongside the Next app (`server/app.ts`).
 *
 * @example
 * import { Layer } from "effect";
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { serveApp } from "./pipeline.ts";
 * import { apiApp } from "./apiApp.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor("en"))(apiApp);
 * Layer.launch(serveApp(3457)(app));
 * // http://localhost:3457/docs serves the Swagger UI; no Next server boots.
 */
export const apiApp = Layer.mergeAll(
  HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(HealthHandlers),
  ),
  HttpApiSwagger.layer(Api, { path: "/docs" }),
);

/**
 * Required runtime configuration of the standalone API app: the greeter to
 * greet with and the port to serve on. Like the full `AppConfig`, nothing is
 * defaulted; the API app has no mode because it has no variants.
 *
 * @example
 * // With PORT=3457 LANGUAGE=es in the environment:
 * Effect.runSync(ApiAppConfig); // { language: "es", port: 3457 }
 */
export const ApiAppConfig = Config.all({
  language: Config.schema(Language, "LANGUAGE"),
  port: Config.Port("PORT"),
});
