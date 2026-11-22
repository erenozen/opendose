// The React side of Field.validation.ts: reward-early, punish-late
// timing for one problem, for Field and for form-level problems (a
// dialog's summary line).
import { useState } from "react";
import { nextShown, visibleProblem } from "./Field.validation";

/** `problem` is the value's live problem; `submitCount` changes on every
 *  submit attempt. Returns the problem to show, and the blur handler of
 *  the control (or of the form, as focusout). */
export function useValidationTiming(problem: string | null | undefined, submitCount = 0) {
  const [shown, setShown] = useState(false);
  const [seenSubmit, setSeenSubmit] = useState(submitCount);
  let now: boolean;
  if (submitCount !== seenSubmit) {
    setSeenSubmit(submitCount);
    now = nextShown(shown, "submit", !!problem);
  } else {
    now = nextShown(shown, "change", !!problem);
  }
  if (now !== shown) setShown(now);
  return {
    problem: visibleProblem(now, problem),
    onBlur: () => setShown(nextShown(now, "blur", !!problem)),
  };
}
