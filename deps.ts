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

/** The deps for the current render, or an empty context outside the pipeline. */
export const currentContext = (): Context.Context<AppDeps> =>
  depsStore.getStore() ?? (Context.empty() as Context.Context<AppDeps>);
