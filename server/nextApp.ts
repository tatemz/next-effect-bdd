import { NodeHttpServerRequest } from "@effect/platform-node";
import { Config, Effect, Layer, Match, Schema } from "effect";
import { HttpRouter, HttpServerRequest } from "effect/unstable/http";
import { Language } from "../domain/greeter.ts";
import { NextJs, nextCatchAll } from "./next.ts";

/**
 * The closed set of ways the Next app can be composed.
 *
 * A `Schema.Literals` union, so any other string fails decoding, and adding
 * a mode without a branch in `nextFor` is a type error: the set and its
 * compositions cannot drift apart.
 *
 * @example
 * import { Mode } from "./nextApp.ts";
 *
 * Mode.decodeUnknownSync("development"); // "development"
 * // Mode.decodeUnknownSync("staging"); // throws: expected "production" | "development"
 */
export const Mode = Schema.Literals(["production", "development"]);
export type Mode = typeof Mode.Type;

/**
 * Dev-mode hot module reload: hand an HMR upgrade to Next's handler.
 *
 * The platform's `upgrade` listener runs this same router, so an upgrade
 * request for one of Next's HMR paths arrives here before the catch-all.
 * This route hands the socket to Next's upgrade handler (which completes
 * the WebSocket handshake); after that there is no HTTP response to write,
 * so the fiber parks until the socket closes - the platform interrupts it
 * then, and the finalizer destroys the socket so a server shutdown cannot
 * be held open by a lingering HMR tab.
 *
 * @example
 * // Reachable only in the development composition; exercise it by running:
 * //   MODE=development PORT=3456 LANGUAGE=en pnpm dev:next
 * // then opening http://localhost:3456 in a browser - edits hot-reload.
 */
const hmrUpgrade = Effect.fn("NextApp.hmrUpgrade")(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const next = yield* NextJs;
  const req = NodeHttpServerRequest.toIncomingMessage(request);
  const socket = req.socket;
  if (socket === null) {
    return yield* Effect.fail("hmr upgrade arrived without a socket");
  }
  // The browser has not pipelined any frames behind the upgrade request, so
  // an empty head is all Next's handshake needs.
  yield* next.upgrade(req, socket, Buffer.alloc(0));
  return yield* Effect.never.pipe(Effect.ensuring(Effect.sync(() => socket.destroy())));
});

/**
 * The HMR paths Next's dev bundlers dial, as routes on the shared router.
 *
 * Part of the development composition only; each path routes to
 * `hmrUpgrade`.
 *
 * @example
 * // The routes this layer registers, as a sketch:
 * //   HttpRouter.add("GET", "/_next/webpack-hmr", hmrUpgrade)
 * //   HttpRouter.add("GET", "/_next/hmr", hmrUpgrade)
 * // nextDevelopment already merges them in, so apps use it directly.
 */
const hmrRoutes = Layer.mergeAll(
  HttpRouter.add("GET", "/_next/webpack-hmr", hmrUpgrade),
  HttpRouter.add("GET", "/_next/hmr", hmrUpgrade),
);

/**
 * The standalone Next.js app, prepared for production: everything the
 * router does not already route goes to the `NextJs` service, which renders
 * it with a production Next server. HMR upgrade paths do not exist in this
 * app - they are not filtered out, they were never built.
 *
 * @example
 * import { Layer } from "effect";
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { serveApp } from "./pipeline.ts";
 * import { nextProduction } from "./nextApp.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor("en"))(nextProduction);
 * Layer.launch(serveApp(3456)(app));
 * // http://localhost:3456 renders every unmatched route through Next.
 */
export const nextProduction = HttpRouter.provideRequest(NextJs.layer({ dev: false }))(
  nextCatchAll,
);

/**
 * The standalone Next.js app, prepared for development: the production
 * routes *plus* the HMR upgrade paths, with Next prepared in dev mode. The
 * platform's `upgrade` listener runs this same router, so those paths reach
 * Next's upgrade handler and live refresh works through the Effect server
 * unchanged.
 *
 * @example
 * import { Layer } from "effect";
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { serveApp } from "./pipeline.ts";
 * import { nextDevelopment } from "./nextApp.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor("en"))(nextDevelopment);
 * Layer.launch(serveApp(3456)(app));
 * // Same as production, plus Next's HMR upgrade paths: edits hot-reload.
 */
export const nextDevelopment = HttpRouter.provideRequest(NextJs.layer({ dev: true }))(
  Layer.mergeAll(nextCatchAll, hmrRoutes),
);

/**
 * Total mapping from the `Mode` union to a Next composition - the same
 * shape as `Greeter.layerFor`. `Match.exhaustive` forces a branch for every
 * mode at compile time, and there is no mode in between the two.
 *
 * @example
 * import { Layer } from "effect";
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { Incrementer } from "../domain/incrementer.ts";
 * import { serveApp } from "./pipeline.ts";
 * import { nextFor } from "./nextApp.ts";
 *
 * // Merged, so page renders can also read the counter the greeter bumps.
 * const greeter = Layer.provideMerge(
 *   Greeter.layerFor("en"),
 *   Incrementer.greetingCountLayer,
 * );
 * const app = HttpRouter.provideRequest(greeter)(nextFor("development"));
 * Layer.launch(serveApp(3456)(app));
 * // http://localhost:3456 renders through Next; no API routes exist here.
 */
export const nextFor = (mode: Mode) =>
  Match.value(mode).pipe(
    Match.when("production", () => nextProduction),
    Match.when("development", () => nextDevelopment),
    Match.exhaustive,
  );

/**
 * Required runtime configuration of the standalone Next app: the mode, the
 * greeter for page renders, and the port. Nothing is defaulted; invalid
 * values fail at startup with a typed `ConfigError`.
 *
 * @example
 * import { Effect } from "effect";
 * import { NextAppConfig } from "./nextApp.ts";
 *
 * // With PORT=3456 LANGUAGE=en MODE=development in the environment:
 * Effect.runSync(NextAppConfig); // { mode: "development", language: "en", port: 3456 }
 */
export const NextAppConfig = Config.all({
  mode: Config.schema(Mode, "MODE"),
  language: Config.schema(Language, "LANGUAGE"),
  port: Config.Port("PORT"),
});
