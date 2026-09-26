import { AsyncLocalStorage } from "node:async_hooks";
import { Context } from "effect";
import type { Greeter } from "./greeter.ts";

/** The services the running app injects into every page render. */
export type AppDeps = Greeter;

declare global {
  // Stashed on globalThis so the store is shared even when Next's page bundle
  // and the custom server evaluate this module as separate module instances.
  var __appDepsStore: AsyncLocalStorage<Context.Context<AppDeps>> | undefined;
}

/** Carries the app's Effect context from the server pipeline into page renders. */
export const depsStore: AsyncLocalStorage<Context.Context<AppDeps>> =
  (globalThis.__appDepsStore ??= new AsyncLocalStorage());

/**
 * The deps for the current render. Fails loudly when no context was passed
 * in: an empty context would silently be missing every `AppDeps` service,
 * so rendering outside the pipeline is a bug, not a supported mode.
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

/** Runs a Next render callback with the given Effect context available to pages. */
export const runInRenderContext = <A>(
  context: Context.Context<AppDeps>,
  f: () => Promise<A>,
): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    depsStore.run(context, () => {
      f().then(resolve, reject);
    });
  });
