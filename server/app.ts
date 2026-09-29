import { Layer } from "effect";
import { apiApp } from "./apiApp.ts";
import { layerDev as nextLayerDev, layerProd as nextLayerProd } from "./nextApp.ts";

/**
 * The combined app: the typed Effect API and the Next.js app sharing one
 * router. Each half is an independent composition (`server/apiApp.ts`,
 * `server/nextApp.ts`); combining them here adds nothing new - the API
 * routes and the Next catch-all simply register on the same `HttpRouter`.
 *
 * Both halves still require a `Greeter` per request (the API handler and the
 * page renders resolve the same instance) and leave it for the caller to
 * provide with `HttpRouter.provideRequest`. Page renders additionally read
 * the `Incrementer` the greeter bumps, so the composition root provides the
 * two merged (`Layer.provideMerge(greeterLayer, Incrementer.greetingCountLayer)`),
 * not just the `Greeter`.
 *
 * @example
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { Language } from "./config.ts";
 * import { layerProd } from "./app.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor(Language.English))(layerProd);
 * // /health, /docs, and /openapi.json come from the API half; everything
 * // else renders through Next.
 */
export const layerProd = Layer.mergeAll(apiApp, nextLayerProd);

/**
 * The combined app in development: the API plus the Next app with its HMR
 * upgrade paths and a dev-mode Next server.
 *
 * `distDir` optionally overrides Next's build directory (see
 * `server/nextApp.ts`'s `layerDev`).
 *
 * @example
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { Language } from "./config.ts";
 * import { layerDev } from "./app.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor(Language.English))(layerDev());
 * // Same routes as production, plus Next's HMR upgrade paths and live reload.
 */
export const layerDev = (distDir?: string) =>
  Layer.mergeAll(apiApp, nextLayerDev(distDir));
