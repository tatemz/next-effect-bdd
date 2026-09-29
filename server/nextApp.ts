import { NodeHttpServerRequest } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest } from "effect/unstable/http";
import { NextJs, nextCatchAll } from "./next.ts";

/**
 * Dev-mode hot module reload: hand an HMR upgrade to Next's handler.
 *
 * The platform's `upgrade` listener runs the same router as ordinary
 * requests, so an upgrade request for one of Next's HMR paths arrives here
 * before the catch-all. This route hands the socket to Next's upgrade
 * handler (which completes the WebSocket handshake); after that there is no
 * HTTP response to write, so the fiber parks until the socket closes - the
 * platform interrupts it then, and the finalizer destroys the socket so a
 * server shutdown cannot be held open by a lingering HMR tab.
 *
 * @example
 * // Reachable only where `hmrRoutes` is wired in (see `layerDev`);
 * // exercise it by running:
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
    // An upgrade request without a socket is an invariant violation, not a
    // recoverable failure: it dies rather than producing a request error.
    return yield* Effect.die("hmr upgrade arrived without a socket");
  }
  // The browser has not pipelined any frames behind the upgrade request, so
  // an empty head is all Next's handshake needs.
  yield* next.upgrade(req, socket, Buffer.alloc(0));
  return yield* Effect.never.pipe(Effect.ensuring(Effect.sync(() => socket.destroy())));
});

/**
 * The HMR paths Next's dev bundlers dial, as routes on the shared router.
 *
 * A plain router layer like `nextCatchAll`: wire it into a development app
 * (see {@link layerDev}) and it registers; leave it out (production) and the
 * paths do not exist. Each path routes to `hmrUpgrade`.
 */
export const hmrRoutes = Layer.mergeAll(
  HttpRouter.add("GET", "/_next/webpack-hmr", hmrUpgrade),
  HttpRouter.add("GET", "/_next/hmr", hmrUpgrade),
);

/**
 * The Next.js app, prepared for production: everything the router does not
 * already route goes to the `NextJs` service, which renders it with a
 * production Next server. HMR upgrade paths do not exist in this app - they
 * are not filtered out, they are simply not wired in.
 *
 * @example
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { Language } from "./config.ts";
 * import { serveApp } from "./pipeline.ts";
 * import { layerProd } from "./nextApp.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor(Language.English))(layerProd);
 * Layer.launch(serveApp(3456)(app));
 * // http://localhost:3456 renders every unmatched route through Next.
 */
export const layerProd = HttpRouter.provideRequest(
  NextJs.layer({ dev: false }),
)(nextCatchAll);

/**
 * The Next.js app, prepared for development: the production catch-all
 * *plus* the HMR upgrade paths, all served by one dev-mode Next server. The
 * platform's `upgrade` listener runs this same router, so those paths reach
 * Next's upgrade handler and live refresh works through the Effect server
 * unchanged.
 *
 * `distDir` optionally overrides Next's build directory; pass one to keep a
 * dev server's on-demand output away from a production `.next` build.
 *
 * @example
 * import { HttpRouter } from "effect/unstable/http";
 * import { Greeter } from "../domain/greeter.ts";
 * import { Language } from "./config.ts";
 * import { serveApp } from "./pipeline.ts";
 * import { layerDev } from "./nextApp.ts";
 *
 * const app = HttpRouter.provideRequest(Greeter.layerFor(Language.English))(layerDev());
 * Layer.launch(serveApp(3456)(app));
 * // Same routes as production, plus Next's HMR upgrade paths: edits hot-reload.
 */
export const layerDev = (distDir?: string) =>
  HttpRouter.provideRequest(
    NextJs.layer({
      dev: true,
      conf: distDir === undefined ? undefined : { distDir },
    }),
  )(Layer.mergeAll(nextCatchAll, hmrRoutes));
