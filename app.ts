import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Context, Effect, Function, Layer, Scope } from "effect";
import Next from "next";
import { GreeterEnglish, GreeterSpanish } from "./greeter.ts";
import { type AppDeps, depsStore } from "./deps.ts";

// Next's CJS entry types `import Next from "next"` as a namespace, so bind the
// real factory signature from its deep declaration file.
type CreateNextServer = (typeof import("next/dist/server/next.js"))["default"];
type NextApp = ReturnType<CreateNextServer>;

/** A prepared Next app that is not serving requests yet. */
export interface AppPending {
  readonly app: NextApp;
}

/** A pending app whose services are built and ready to inject. */
export interface AppProvided extends AppPending {
  readonly context: Context.Context<AppDeps>;
}

/** `makeApp(port)` - build and prepare the Next app without serving. */
export const makeApp = (port: number): Effect.Effect<AppPending, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const app = (Next as unknown as CreateNextServer)({ dev: false, port });
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => app.close()).pipe(Effect.catch(() => Effect.void)),
    );
    yield* Effect.promise(() => app.prepare());
    return { app };
  });

/** `provideDeps(layer)` - build the app's services against a pending app. */
export const provideDeps =
  (deps: Layer.Layer<AppDeps>) =>
  (self: Effect.Effect<AppPending, unknown, Scope.Scope>): Effect.Effect<AppProvided, unknown, Scope.Scope> =>
    Effect.gen(function* () {
      return { ...(yield* self), context: yield* Layer.build(deps) };
    });

/** `start()` - listen and serve every request with the provided context in scope. */
export const start = (
  self: Effect.Effect<AppProvided, unknown, Scope.Scope>,
): Effect.Effect<number, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const { app, context } = yield* self;
    const handler = app.getRequestHandler();
    const server = createServer((req, res) => {
      depsStore.run(context, () => {
        void handler(req, res).catch((cause: unknown) => {
          console.error(cause);
          res.statusCode = 500;
          res.end();
        });
      });
    });
    return yield* Effect.flatMap(
      Effect.acquireRelease(
        Effect.promise(
          () =>
            new Promise<AddressInfo>((resolve) =>
              // makeApp's port flows through Next's app; 0 means ephemeral.
              server.listen(app.port ?? 0, () => resolve(server.address() as AddressInfo)),
            ),
        ),
        () => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
      ),
      (address) => Effect.succeed(address.port),
    );
  });

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3456);
  const greeter = process.env.LANGUAGE === "es" ? GreeterSpanish : GreeterEnglish;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const bound = yield* Function.pipe(makeApp(port), provideDeps(greeter), start);
        yield* Effect.log(`> Ready on http://localhost:${bound}`);
        return yield* Effect.never;
      }),
    ),
  );
}
