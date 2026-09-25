import { Effect } from "effect";
import { currentContext } from "../deps.ts";
import { Greeter } from "../greeter.ts";

// Rendering reads the per-request context from the pipeline, so there is
// nothing to prerender at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const greeting = await Effect.runPromiseWith(currentContext())(
    Greeter.use((greeter) => greeter.greet()),
  );
  return <main id="message">{greeting}</main>;
}
