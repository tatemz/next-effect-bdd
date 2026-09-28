import { FeedbackViewModel } from "./Feedback.model.ts";
import styles from "./Feedback.module.css";

/**
 * Presentational props: the encoded sub-viewmodel plus the two client hooks
 * the connected view supplies. Keeping `dispatch`/`isPending` as explicit
 * props keeps this file free of client state, so it stays renderable outside
 * the action (previews, tests).
 */
export type FeedbackProps = typeof FeedbackViewModel.Encoded & {
  readonly dispatch: (formData: FormData) => void;
  readonly isPending: boolean;
};

/**
 * The feedback sub-view, matched exhaustively on the union: `NotRevealed`
 * shows the reveal form wired to `dispatch`, `Revealed` shows the message,
 * and `Failed` shows the error with a retry (the controller re-runs the
 * reveal for that submit). A new union case is a compile error here until
 * the view handles it.
 */
export const Feedback = ({ dispatch, isPending, ...model }: FeedbackProps) =>
  FeedbackViewModel.match(model, {
    // A function `action` makes React own the submit: it preventDefaults,
    // serializes the form to FormData, and hands it to the action state.
    NotRevealed: () => (
      <form className={styles.feedback} action={dispatch}>
        <button className={styles.revealButton} type="submit" disabled={isPending}>
          {isPending ? "Revealing…" : "Reveal me!"}
        </button>
      </form>
    ),
    Revealed: ({ message }) => <p className={styles.feedback}>{message}</p>,
    Failed: ({ message }) => (
      <div className={styles.failed}>
        <p className={styles.feedback}>{message}</p>
        <form className={styles.feedback} action={dispatch}>
          <button className={styles.revealButton} type="submit" disabled={isPending}>
            {isPending ? "Retrying…" : "Try again"}
          </button>
        </form>
      </div>
    ),
  });
