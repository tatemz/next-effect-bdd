import { Effect, Match, SchemaIssue } from "effect";
import { FeedbackViewModel } from "./Feedback.model.ts";

/**
 * The secret the reveal hands out. A constant so the revealed state has a
 * single source of truth; swap it for a service lookup when there is more
 * than one possible feedback.
 */
export const revealedMessage = "The secret: this model round-tripped through a server action.";

/**
 * The reveal effect: the next `FeedbackViewModel` for the current one.
 *
 * Matched exhaustively on the union, so every transition is explicit:
 * `NotRevealed` reveals; an already-`Revealed` state is returned unchanged,
 * making repeated submits idempotent; `Failed` retries the reveal, so the
 * error state's "Try again" resolves in one submit. Validation of the new
 * state stays in the error channel via `makeEffect`.
 *
 * @example
 * import { Effect } from "effect";
 * import { revealFeedback } from "./Feedback.controller.ts";
 *
 * const next = Effect.runSync(
 *   Effect.andThen(revealFeedback({ _tag: "NotRevealed" }), Effect.orDie),
 * ); // { _tag: "Revealed", message: "The secret: …" }
 */
export const revealFeedback = (
  prev: FeedbackViewModel,
): Effect.Effect<FeedbackViewModel, SchemaIssue.Issue> =>
  Match.value(prev).pipe(
    Match.tag("Revealed", (revealed) => Effect.succeed(revealed)),
    Match.tag(
      "NotRevealed",
      "Failed",
      () =>
        FeedbackViewModel.makeEffect({
          _tag: "Revealed",
          message: revealedMessage,
        }),
    ),
    Match.exhaustive,
  );
