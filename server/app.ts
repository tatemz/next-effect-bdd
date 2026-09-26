import { NodeHttpServerRequest } from "@effect/platform-node";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
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
/**
 * Dev-mode hot module reload: the platform's `upgrade` listener runs this
 * same router, so an upgrade request for one of Next's HMR paths arrives
 * here before the catch-all. We hand the socket to Next's upgrade handler
 * (which completes the WebSocket handshake); after that there is no HTTP
 * response to write, so the fiber parks until the socket closes - the
 * platform interrupts it then, and the finalizer destroys the socket so a
 * server shutdown cannot be held open by a lingering HMR tab.
 */
const hmrUpgrade = Effect.fn("App.hmrUpgrade")(function* (
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

/** The HMR paths Next's dev bundlers dial, as routes on the shared router. */
const hmrRoutes = Layer.mergeAll(
  HttpRouter.add("GET", "/_next/webpack-hmr", hmrUpgrade),
  HttpRouter.add("GET", "/_next/hmr", hmrUpgrade),
);

/**
 * This app's routes: the Effect health route, with Next.js catching
 * everything else. In dev mode the HMR upgrade paths route to Next's
 * upgrade handler instead of the render catch-all.
 */
export const createApp = (options: NextOptions) => {
  const routes = Layer.mergeAll(
    HttpRouter.add("GET", "/health", healthRoute),
    ...(options.dev ? [hmrRoutes] : []),
    nextCatchAll,
  );
  return HttpRouter.provideRequest(NextJs.layer(options))(routes);
};

/**
 * Required runtime configuration, read from the Config provider. Nothing
 * is defaulted: a missing `PORT`, `LANGUAGE`, or `DEV` fails at startup
 * with a typed `ConfigError`, as do invalid values (`NaN` ports and
 * misspelled languages are unrepresentable). `pnpm start` therefore needs
 * all three set, e.g. `PORT=3456 LANGUAGE=en DEV=false pnpm start`.
 */
export const AppConfig = Config.all({
  dev: Config.Boolean("DEV"),
  language: Config.schema(Language, "LANGUAGE"),
  port: Config.Port("PORT"),
});
