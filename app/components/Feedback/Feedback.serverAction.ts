"use server";

import { Effect, SchemaIssue, SchemaParser } from "effect";
import { revealFeedback } from "./Feedback.controller.ts";
import {
  FeedbackViewModel,
  type FeedbackViewModel as FeedbackModel,
} from "./Feedback.model.ts";

const formatIssue = SchemaIssue.makeFormatterDefault();

/**
 * The failure model for a schema issue: the formatted issue becomes the
 * `Failed` message. The `||` fallback makes the `NonEmptyString` invariant
 * unbreakable, so `make` below cannot throw.
 */
const failedFromIssue = (issue: SchemaIssue.Issue): FeedbackModel =>
  FeedbackViewModel.make({
    _tag: "Failed",
    message: formatIssue(issue) || "The reveal failed.",
  });

/**
 * The reveal server action, shaped for `useActionState`: it receives the
 * previous model and the submitted form, and resolves with the next model,
 * which React stores as the new state.
 *
 * The action never fails. The state crosses the client boundary, so both
 * sides are schema-checked — decoding re-validates what the client sent back
 * (a client can send anything) and encoding hands the client plain data —
 * and any schema failure is *carried* as the `Failed` variant rather than
 * thrown, so the view always receives a renderable model.
 *
 * @example
 * import { useActionState } from "react";
 * import { reveal } from "./Feedback.serverAction.ts";
 *
 * const [model, dispatch, isPending] = useActionState(reveal, initialModel);
 */
export async function reveal(
  prevState: FeedbackModel,
  _formData: FormData,
): Promise<FeedbackModel> {
  return Effect.runPromise(
    SchemaParser.decodeEffect(FeedbackViewModel)(prevState).pipe(
      Effect.flatMap(revealFeedback),
      Effect.flatMap((next) => SchemaParser.encodeEffect(FeedbackViewModel)(next)),
      Effect.catch((issue) => Effect.succeed(failedFromIssue(issue))),
    ),
  );
}
