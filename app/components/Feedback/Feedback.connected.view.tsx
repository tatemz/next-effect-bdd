"use client";

import { useActionState } from "react";
import type { FeedbackViewModel } from "./Feedback.model.ts";
import { reveal } from "./Feedback.serverAction.ts";
import { Feedback } from "./Feedback.view.tsx";

/**
 * Connects the feedback sub-viewmodel to the reveal server action.
 *
 * The model *is* the `useActionState` state: seeded with the server-rendered
 * variant, replaced by whatever the action resolves with — which is the next
 * `FeedbackViewModel`. No separate client state exists; the only props are
 * the initial model the server handed down.
 *
 * @example
 * // From a server component, with the encoded sub-viewmodel:
 * <ConnectedFeedback {...model.feedback} />
 */
export const ConnectedFeedback = (model: FeedbackViewModel) => {
  const [state, dispatch, isPending] = useActionState<FeedbackViewModel, FormData>(
    reveal,
    model,
  );
  return <Feedback {...state} dispatch={dispatch} isPending={isPending} />;
};
