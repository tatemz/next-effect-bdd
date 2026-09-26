import { NodeHttpServer } from "@effect/platform-node";
import { Context, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { NetAddress } from "effect/unstable/net";
import { createServer } from "node:http";

/**
 * The value flowing through the app pipeline: a layer that registers routes
 * on the HTTP router, plus any route dependencies (as router request markers)
 * still waiting for `HttpRouter.provideRequest`.
 */
export type EffectApp<E = never, R = never> = Layer.Layer<
  never,
  E,
  HttpRouter.HttpRouter | R
>;

/**
 * `serveApp(port)` - the pipeline's Layer terminator: `HttpRouter.serve`
 * over `NodeHttpServer`, the canonical V4 setup. Launch or build the layer
 * to run the app; `0` picks an ephemeral port.
 */
export const serveApp = (port: number) => <E, R>(self: EffectApp<E, R>) =>
  Layer.provideMerge(
    HttpRouter.serve(self),
    NodeHttpServer.layer(() => createServer(), { port }),
  );

/**
 * `startApp(port)` - build the served app and return the bound port. The
 * server runs until the surrounding scope closes; `0` picks an ephemeral
 * port, which is how the BDD scenarios get an isolated server per scenario.
 */
export const startApp = (port: number) => <E, R>(self: EffectApp<E, R>) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(serveApp(port)(self));
    const address = Context.get(context, HttpServer.HttpServer).address;
    if (NetAddress.isInetAddress(address)) {
      return address.port;
    }
    return yield* Effect.die(`startApp expects an inet address, got ${address._tag}`);
  });
