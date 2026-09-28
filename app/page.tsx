import { Effect } from "effect";
import { currentContext } from "../server/deps.ts";
import { greetingCard } from "./components/GreetingCard/GreetingCard.controller.ts";
import { GreetingCard } from "./components/GreetingCard/GreetingCard.view.tsx";

/**
 * Opt this route out of build-time prerendering.
 *
 * The page's effect reads the per-request Effect context from the pipeline,
 * which only exists per request, so every visit renders fresh.
 *
 * @example
 * // Next reads this route segment config at build time:
 * //   export const dynamic = "force-dynamic";
 * // With it, `pnpm build` does not try to render the greeting at build time.
 */
export const dynamic = "force-dynamic";

const page = Effect.map(greetingCard, GreetingCard);

/**
 * The home page: the greeting-card effect rendered as a React Server
 * Component.
 *
 * This is only the run-promise boundary; the greeting program lives in
 * `greetingCard`, and this boundary resolves it per request.
 *
 * @example
 * // With the app serving (pnpm start), a plain GET renders the card:
 * //   curl -s http://localhost:3456/ | grep '<main id="message">'
 * //   # <main id="message">Hello!</main>
 */
export default async function HomePage() {
  return await Effect.runPromiseWith(currentContext())(page);
}
