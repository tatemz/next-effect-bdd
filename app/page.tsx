import { Effect, Schema } from "effect";
import { Greeter } from "../domain/greeter.ts";
import { currentContext } from "../server/deps.ts";
import { ConnectedFeedback } from "./components/Feedback/Feedback.connected.view.tsx";
import { FeedbackViewModel } from "./components/Feedback/Feedback.model.ts";
import styles from "./page.module.css";

// Rendering reads the per-request context from the pipeline, so there is
// nothing to prerender at build time.
export const dynamic = "force-dynamic";

const ViewModel = Schema.TaggedStruct("Main", {
  message: Schema.NonEmptyString,
  feedback: FeedbackViewModel,
});

// The BDD scenario pins the exact markup `<main id="message">…</main>`, so
// `main` stays attribute-free (the module styles it via `.page main`).
const View = (model: typeof ViewModel.Encoded) => (
  <div className={styles.page}>
    <section className={styles.card}>
      <p className={styles.kicker}>Effect × Next.js</p>
      <main id="message">{model.message}</main>
      <ConnectedFeedback {...model.feedback} />
      <p className={styles.caption}>
        Server-rendered by a <code>Greeter</code> service resolved from the request's
        Effect context.
      </p>
    </section>
  </div>
);

const controller = Effect.gen(function* () {
  const greeter = yield* Greeter;
  const message = yield* greeter.greet;
  return yield* ViewModel.makeEffect({
    message,
    feedback: { _tag: "NotRevealed" },
  });
});

const page = Effect.map(controller, View);

export default async function HomePage() {
  return await Effect.runPromiseWith(currentContext())(page);
}
