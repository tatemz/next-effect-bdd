import { Effect, Schema } from "effect";
import { Greeter } from "../domain/greeter.ts";
import { currentContext } from "../server/deps.ts";

// Rendering reads the per-request context from the pipeline, so there is
// nothing to prerender at build time.
export const dynamic = "force-dynamic";

const ViewModel = Schema.TaggedStruct("Main", {
  message: Schema.NonEmptyString,
});

const View = (model: typeof ViewModel.Encoded) => <main id="message">{model.message}</main>;

const controller = Effect.gen(function* () {
  const greeter = yield* Greeter;
  const message = yield* greeter.greet;
  return yield* ViewModel.makeEffect({ message });
});

const page = Effect.map(controller, View);

export default async function HomePage() {
  return await Effect.runPromiseWith(currentContext())(page);
}
