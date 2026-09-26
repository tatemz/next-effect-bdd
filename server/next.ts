import { NodeHttpServerRequest } from "@effect/platform-node";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import Next from "next";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { type AppDeps, runInRenderContext } from "./deps.ts";

// Next's CJS entry types `import Next from "next"` as a namespace, so bind the
// real factory signature from its deep declaration file.
type NextFactory = (typeof import("next/dist/server/next.js"))["default"];
type NextServer = ReturnType<NextFactory>;
export type NextOptions = Parameters<NextFactory>[0];

/**
 * A Next.js promise rejected at one of its lifecycle stages.
 *
 * Every Next call in `NextJs.layer` is wrapped in `Effect.tryPromise`, so a
 * rejection surfaces as this typed error with the `stage` that failed
 * (`"prepare"`, `"render"`, or `"upgrade"`) and the original cause.
 *
 * @example
 * import { Effect } from "effect";
 * import { NextJsError } from "./next.ts";
 *
 * const failure = new NextJsError({ stage: "prepare", cause: new Error("EADDRINUSE") });
 * failure.stage; // "prepare"
 */
export class NextJsError extends Schema.TaggedError<NextJsError>()("NextJsError", {
  stage: Schema.Literals(["prepare", "render", "upgrade"]),
  cause: Schema.Defect(),
}) {}

/**
 * The Next.js side of the app as a service: one prepared Next server that
 * renders requests.
 *
 * `render` hands the request to Next on the raw Node request/response,
 * waits for Next to finish writing, and resolves with the sentinel response
 * carrying Next's status. Because rendering is just a service method, a
 * scenario or test can provide a fake instead of booting the real Next
 * server.
 *
 * @example
 * import { Effect, Layer } from "effect";
 * import { HttpServerResponse } from "effect/unstable/http";
 * import { NextJs } from "./next.ts";
 *
 * const fakeNext = Layer.succeed(
 *   NextJs,
 *   NextJs.of({
 *     render: Effect.succeed(HttpServerResponse.text("from a fake")),
 *     upgrade: Effect.void,
 *   }),
 * );
 */
export class NextJs extends Context.Service<
  NextJs,
  {
    /**
     * Renders one request through Next.
     *
     * Hands the request to Next on the raw Node request/response, waits for
     * Next to finish writing, and resolves with a sentinel response carrying
     * Next's status; the server writer skips the sentinel because Next owns
     * the response.
     *
     * @example
     * import { Effect } from "effect";
     * import { NextJs } from "./next.ts";
     *
     * const next = yield* NextJs;
     * const response = yield* next.render(request);
     */
    readonly render: (
      request: HttpServerRequest.HttpServerRequest,
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, NextJsError>;
    /**
     * Hands a raw upgrade request (Next's dev-mode HMR socket) to Next.
     *
     * Completes the WebSocket handshake on Next's behalf; only meaningful
     * when `dev` is enabled, as production Next ignores upgrades.
     *
     * @example
     * import { Effect } from "effect";
     * import { NextJs } from "./next.ts";
     *
     * const next = yield* NextJs;
     * yield* next.upgrade(req, socket, Buffer.alloc(0));
     */
    readonly upgrade: (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ) => Effect.Effect<void, NextJsError>;
  }
>()("NextJs") {
  /**
   * The live implementation: boot a real Next server.
   *
   * Prepares Next when the layer builds, closes it when the layer's scope
   * closes, and fails with a `NextJsError` (stage `"prepare"`) if
   * preparation rejects.
   *
   * @example
   * import { HttpRouter } from "effect/unstable/http";
   * import { NextJs } from "./next.ts";
   *
   * const routes = HttpRouter.provideRequest(NextJs.layer({ dev: false }))(nextCatchAll);
   */
  // Next's own options make `dev` optional; requiring it here keeps the
  // mode an explicit, declared choice at every construction site.
  static readonly layer = (options: NextOptions & { readonly dev: boolean }) =>
    Layer.effect(
      NextJs,
      Effect.gen(function* () {
        const next: NextServer = (Next as unknown as NextFactory)(options);
        yield* Effect.addFinalizer(() =>
          Effect.tryPromise({ try: () => next.close(), catch: () => undefined }).pipe(
            Effect.ignore,
          ),
        );
        yield* Effect.tryPromise({
          try: () => next.prepare(),
          catch: (cause) => new NextJsError({ stage: "prepare", cause }),
        });
        const handler = next.getRequestHandler();
        const upgradeHandler = next.getUpgradeHandler();
        return NextJs.of({
          render: Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
            const req = NodeHttpServerRequest.toIncomingMessage(request);
            const res = NodeHttpServerRequest.toServerResponse(request);
            // The request fiber's context carries the provided dependencies;
            // the AsyncLocalStorage bridge carries it across Next's own async
            // machinery into React Server Component renders.
            const context = (yield* Effect.context<never>()) as Context.Context<AppDeps>;
            yield* Effect.tryPromise({
              try: () => runInRenderContext(context, () => handler(req, res)),
              catch: (cause) => new NextJsError({ stage: "render", cause }),
            });
            // Next owns this response: wait for it to finish so the server
            // writer's `writableEnded` check skips the sentinel below.
            yield* awaitFinished(res);
            return HttpServerResponse.empty({ status: res.statusCode });
          }),
          upgrade: (request, socket, head) =>
            Effect.tryPromise({
              try: () => upgradeHandler(request, socket, head),
              catch: (cause) => new NextJsError({ stage: "upgrade", cause }),
            }),
        });
      }),
    );
}

/**
 * Routes every request no Effect route matched to the `NextJs` service.
 *
 * The `"*"`/`"*"` router layer that makes Next the app's fallback: add it
 * last so earlier Effect routes win, and provide an implementation with
 * `HttpRouter.provideRequest` - the live `NextJs.layer(options)`, or a fake
 * in tests.
 *
 * @example
 * import { Layer } from "effect";
 * import { HttpRouter } from "effect/unstable/http";
 * import { NextJs, nextCatchAll } from "./next.ts";
 *
 * const routes = HttpRouter.provideRequest(NextJs.layer({ dev: false }))(nextCatchAll);
 */
export const nextCatchAll = HttpRouter.add(
  "*",
  "*",
  Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
    const next = yield* NextJs;
    return yield* next.render(request);
  }),
);

/**
 * Waits until the Node response has finished (or the connection closed).
 *
 * Resolves immediately for an already-ended response; otherwise it parks on
 * the `finish` and `close` events, whichever fires first, so a render never
 * resolves before Next has written everything.
 */
const awaitFinished = (res: ServerResponse) =>
  res.writableEnded || res.finished
    ? Effect.void
    : Effect.callback<void>((resume) => {
        const done = () => resume(Effect.void);
        res.once("finish", done);
        res.once("close", done);
      });
