import { AsyncLocalStorage } from "node:async_hooks";
import { Context } from "effect";
import type { Greeter } from "../domain/greeter.ts";
import type { Incrementer } from "../domain/incrementer.ts";

/**
 * The services the running app injects into every page render.
 *
 * One place to grow the set: add a service to this union and every page can
 * `yield*` it, while `currentContext` still fails fast when a render
 * happens outside the pipeline.
 *
 * @example
 * import { Context, Effect } from "effect";
 * import { Greeter } from "../domain/greeter.ts";
 * import { Incrementer } from "../domain/incrementer.ts";
 * import type { AppDeps } from "./deps.ts";
 *
 * const context: Context.Context<AppDeps> = Context.make(
 *   Greeter,
 *   Greeter.of({ greet: Effect.succeed("Hello!") }),
 * ).pipe(Context.add(Incrementer, Incrementer.of({
 *   increment: () => Effect.void,
 *   value: Effect.succeed(0),
 * })));
 */
export type AppDeps = Greeter | Incrementer;

declare global {
  // Stashed on globalThis so the store is shared even when Next's page bundle
  // and the custom server evaluate this module as separate module instances.
  var __appDepsStore: AsyncLocalStorage<Context.Context<AppDeps>> | undefined;
}

/**
 * Carries the app's Effect context from the server pipeline into page
 * renders.
 *
 * Next's own async machinery sits between the request fiber and the React
 * Server Component render, and it does not preserve Effect's context; this
 * store is what crosses that gap, set by `runInRenderContext` and read by
 * `currentContext`.
 *
 * @example
 * import { depsStore } from "./deps.ts";
 *
 * depsStore.getStore(); // undefined outside a render
 */
export const depsStore: AsyncLocalStorage<Context.Context<AppDeps>> =
  (globalThis.__appDepsStore ??= new AsyncLocalStorage());

/**
 * The deps for the current render.
 *
 * Fails loudly when no context was passed in: an empty context would
 * silently be missing every `AppDeps` service, so rendering outside the
 * pipeline is a bug, not a supported mode.
 *
 * @example
 * import { Effect } from "effect";
 * import { Greeter } from "../domain/greeter.ts";
 * import { currentContext } from "./deps.ts";
 *
 * const greeting = await Effect.runPromiseWith(currentContext())(
 *   Effect.flatMap(Greeter, (greeter) => greeter.greet),
 * );
 */
export const currentContext = (): Context.Context<AppDeps> => {
  const context = depsStore.getStore();
  if (context === undefined) {
    throw new Error(
      "No app context for this render. Pages must render inside the Effect app pipeline (see runInRenderContext).",
    );
  }
  return context;
};

/**
 * Runs a Next render callback with the given Effect context available to
 * pages.
 *
 * Puts `context` in `depsStore` for the duration of `f`, so pages rendered
 * by the callback can read it with `currentContext`.
 *
 * @example
 * import { runInRenderContext } from "./deps.ts";
 *
 * await runInRenderContext(appContext, () => nextHandler(req, res));
 */
export const runInRenderContext = <A>(
  context: Context.Context<AppDeps>,
  f: () => Promise<A>,
): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    depsStore.run(context, () => {
      f().then(resolve, reject);
    });
  });
