// The step-by-step dialog every assay module opens: a stepper along the
// top (any step done or reachable can be revisited), the current step's
// heading and form, and Back / Next / Finish with one primary. The
// module owns the draft state; this is presentational.
//
// A step change says where the user is: picking a step in the
// stepper moves focus to that step's heading; Next keeps focus on the
// Next button and the new step is announced ("Step 2 of 4: …").
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Modal from "../../../components/Modal";
import { announce, Button, lastInputWasKeyboard } from "../../../components/ui";
import { useDiscardGuard } from "../../../graph/useDiscardGuard";
import { wizardShown } from "./create";
import "./assays.css";

export interface WizardStep {
  id: string;
  title: string;
  render: () => ReactNode;
  /** Why the user cannot go on yet (shown under the step), or null. */
  blocker?: string | null;
}

export default function Wizard({ title, steps, start = 0, finishLabel = "Finish",
  onClose, onFinish }: {
  title: string;
  steps: WizardStep[];
  start?: number;
  finishLabel?: string;
  onClose: () => void;
  onFinish: () => void;
}) {
  const [at, setAt] = useState(Math.min(Math.max(0, start), steps.length - 1));
  useEffect(() => { wizardShown(); }, []);
  const step = steps[at];
  const last = at === steps.length - 1;
  const blocked = !!step.blocker;
  const heading = useRef<HTMLHeadingElement>(null);
  // How the step changed: from the stepper (focus the heading), or by
  // Back / Next (focus stays on the button; the step is announced).
  const via = useRef<"stepper" | "button" | null>(null);
  const [instant, setInstant] = useState(false);
  const go = (to: number, how: "stepper" | "button") => {
    via.current = how;
    setInstant(lastInputWasKeyboard());
    setAt(to);
  };
  useLayoutEffect(() => {
    const how = via.current;
    if (!how) return;
    via.current = null;
    if (how === "stepper") heading.current?.focus({ preventScroll: true });
    announce(`Step ${at + 1} of ${steps.length}: ${steps[at].title}`);
  }, [at, steps]);
  const next = () => {
    if (blocked) return;
    if (last) onFinish();
    else go(at + 1, "button");
  };
  // The draft (pasted plates, a drawn map, a column mapping) lives in the
  // module's state: once anything was entered in a step, Escape or a
  // press on the backdrop asks before dropping it. Cancel stays a close.
  const [dirty, setDirty] = useState(false);
  const touched = () => { if (!dirty) setDirty(true); };
  const guardedClose = useDiscardGuard(dirty, onClose,
    "What you entered in this wizard is not kept.");
  return (
    <Modal title={title} className="modal-wide assay-wizard" onClose={guardedClose} onSubmit={next}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {at > 0 && <Button onClick={() => go(at - 1, "button")}>Back</Button>}
          {/* aria-disabled, not disabled: Next keeps the focus it has
              when the step it opens waits for a file (next() refuses). */}
          <Button type="submit" variant="primary" className="wizard-next"
            aria-disabled={blocked || undefined}>
            {last ? finishLabel : "Next"}
          </Button>
        </>
      }>
      <ol className="wizard-steps" aria-label="Steps" data-still>
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={i === at ? "step" : undefined}
              data-state={i === at ? "current" : i < at ? "done" : "todo"}
              disabled={i > at && steps.slice(at, i).some((x) => !!x.blocker)}
              onClick={() => { if (i !== at) go(i, "stepper"); }}>
              <span className="wizard-step-n" aria-hidden="true">{i + 1}</span>
              <span className="wizard-step-name">{s.title}</span>
              {i < at && <span className="sr-only"> (done)</span>}
            </button>
          </li>
        ))}
      </ol>
      <div className="wizard-body" key={step.id} data-instant={instant || undefined}
        onKeyDownCapture={touched} onPasteCapture={touched}
        onDropCapture={touched} onPointerUpCapture={touched}>
        <h3 ref={heading} tabIndex={-1} className="wizard-step-title">
          <span className="wizard-step-count">Step {at + 1} of {steps.length}<span className="sr-only">: </span></span>
          {step.title}
        </h3>
        {step.render()}
      </div>
      {/* Mounted with the dialog, so a new reason is announced. */}
      <p className="wizard-blocker" role="status">{step.blocker ?? ""}</p>
    </Modal>
  );
}
