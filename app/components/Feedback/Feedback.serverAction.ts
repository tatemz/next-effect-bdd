"use server";

import { Effect } from "effect";
import { currentContext } from "../../../server/deps.ts";
import { revealFromClient } from "./Feedback.controller.ts";
import type { FeedbackViewModel } from "./Feedback.model.ts";

/**
 * The reveal server action, shaped for `useActionState`: it receives the
 * previous model and the submitted form, and resolves with the next model,
 * which React stores as the new state.
 *
 * Like the home page, this is only the run-promise boundary; the reveal
 * program lives in `revealFromClient`, and it is total — failures arrive as
 * the `Failed` view model, never as a rejected action. The action POST also
 * arrives through the Effect pipeline's Next catch-all, so the same request
 * context the page renders read is available here: `revealFromClient` reads
 * the very `Incrementer` the greeter bumps.
 *
 * @example
 * import { useActionState } from "react";
 * import { reveal } from "./Feedback.serverAction.ts";
 *
 * const [model, dispatch, isPending] = useActionState(reveal, initialModel);
 */
export async function reveal(
  prevState: FeedbackViewModel,
  _formData: FormData,
): Promise<FeedbackViewModel> {
  return await Effect.runPromiseWith(currentContext())(revealFromClient(prevState));
}
