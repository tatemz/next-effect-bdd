import { Effect } from "effect";
import { currentContext } from "../server/deps.ts";
import { greetingCard } from "./components/GreetingCard/GreetingCard.controller.ts";
import { GreetingCard } from "./components/GreetingCard/GreetingCard.view.tsx";

// Rendering reads the per-request context from the pipeline, so there is
// nothing to prerender at build time.
export const dynamic = "force-dynamic";

const page = Effect.map(greetingCard, GreetingCard);

export default async function HomePage() {
  return await Effect.runPromiseWith(currentContext())(page);
}
