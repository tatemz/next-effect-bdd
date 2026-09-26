import { NodeHttpServerRequest } from "@effect/platform-node";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import Next from "next";
import type { ServerResponse } from "node:http";
import { type AppDeps, runInRenderContext } from "./deps.ts";

// Next's CJS entry types `import Next from "next"` as a namespace, so bind the
// real factory signature from its deep declaration file.
type NextFactory = (typeof import("next/dist/server/next.js"))["default"];
type NextServer = ReturnType<NextFactory>;
export type NextOptions = Parameters<NextFactory>[0];

/** A Next.js promise rejected at one of its lifecycle stages. */
export class NextJsError extends Schema.TaggedError<NextJsError>()("NextJsError", {
  stage: Schema.Literals(["prepare", "render"]),
  cause: Schema.Defect(),
}) {}

/**
 * The Next.js side of the app as a service: one prepared Next server that
 * renders requests. `render` hands the request to Next on the raw Node
 * request/response, waits for Next to finish writing, and resolves with the
 * sentinel response carrying Next's status.
 *
 * Because rendering is just a service method, a scenario or test can provide
 * `Layer.succeed(NextJs, NextJs.of({ render: ... }))` instead of booting the
 * real Next server.
 */
export class NextJs extends Context.Service<
  NextJs,
  {
    readonly render: (
      request: HttpServerRequest.HttpServerRequest,
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, NextJsError>;
  }
>()("NextJs") {
  static readonly layer = (options: NextOptions) =>
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
        });
      }),
    );
}

/**
 * Routes every request no Effect route matched to the `NextJs` service.
 * Provide an implementation with `HttpRouter.provideRequest`: the live
 * `NextJs.layer(options)`, or a fake in tests.
 */
export const nextCatchAll = HttpRouter.add(
  "*",
  "*",
  Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
    const next = yield* NextJs;
    return yield* next.render(request);
  }),
);

/** Waits until the Node response has finished (or the connection closed). */
const awaitFinished = (res: ServerResponse) =>
  res.writableEnded || res.finished
    ? Effect.void
    : Effect.callback<void>((resume) => {
        const done = () => resume(Effect.void);
        res.once("finish", done);
        res.once("close", done);
      });
