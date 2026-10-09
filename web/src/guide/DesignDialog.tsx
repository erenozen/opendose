import { useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import Modal from "../components/Modal";
import {
  asksFactors, asksRepeats, DESIGN_EXAMPLES, FACTOR_CHOICES, recommendTable, REPEAT_CHOICES,
  VALUE_CHOICES, type DesignAnswers, type TableRecommendation,
} from "./designToTable";
import "../sheets/common/dataNotes.css";

/**
 * "Describe the experiment": three questions (what each value is, what
 * was varied, whether subjects were measured more than once) pick the
 * table type and say how to lay the data out (guide/designToTable.ts).
 */
export default function DesignDialog({ onPick, onClose, action = "Use this table" }: {
  onPick: (r: TableRecommendation) => void;
  onClose: () => void;
  action?: string;
}) {
  const [a, setA] = useState<DesignAnswers>({ value: "measurement", factors: "one", repeats: "independent" });
  const rec = recommendTable(a);
  const radios = <K extends keyof DesignAnswers>(key: K, legend: string,
    choices: [DesignAnswers[K], string, string][]) => (
      <fieldset className="field-radios">
        <legend>{legend}</legend>
        {choices.map(([v, label, note]) => (
          <label key={v}>
            <input type="radio" name={`design-${key}`} checked={a[key] === v}
              onChange={() => setA({ ...a, [key]: v })} />
            <span>{label}<span className="option-note">{note}</span></span>
          </label>
        ))}
      </fieldset>
  );
  const repeatChoices = a.value === "count" ? REPEAT_CHOICES.filter(([v]) => v !== "nested")
    .map(([v, l, n]) => (v === "repeated"
      ? [v, "Yes: the same subjects classified twice", "before and after, or by two raters"] : [v, l, n]) as
      [DesignAnswers["repeats"], string, string]) : REPEAT_CHOICES;
  // Rendered in a portal so it can open from inside another dialog's form;
  // its events stop here instead of reaching that dialog (React events
  // follow the component tree through portals).
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div onSubmit={stop} onPointerDown={stop} onKeyDown={stop} {...({ onCancel: stop } as object)}>
    <Modal title="Describe the experiment" className="modal-wide design-dialog" onClose={onClose}
      onSubmit={() => onPick(rec)}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">{action}</button>
        </>
      }>
      <p className="modal-text">Three questions about the design pick the table and how to lay the
        data out. Or start from an example:</p>
      <div className="design-examples" role="group" aria-label="Examples">
        {DESIGN_EXAMPLES.map((e) => (
          <button key={e.label} type="button" onClick={() => setA(e.answers)}>{e.label}</button>
        ))}
      </div>
      {radios("value", "1. What is each value?", VALUE_CHOICES)}
      {asksFactors(a.value) && radios("factors", "2. What did you vary?", FACTOR_CHOICES)}
      {asksRepeats(a.value) && radios("repeats", `${asksFactors(a.value) ? "3" : "2"}. Was each subject `
        + "measured more than once?", repeatChoices)}
      <div className="design-result" role="status" aria-live="polite">
        <p><strong>{rec.title}</strong></p>
        <p>{rec.layout}</p>
        <p>Analyses: {rec.analyses}</p>
        <p className="note-source">
          Sources:{" "}
          {rec.sources.map((s, i) => (
            <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
          ))}
        </p>
      </div>
    </Modal>
    </div>,
    document.body,
  );
}
