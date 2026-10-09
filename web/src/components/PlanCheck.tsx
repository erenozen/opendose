// A results sheet against the analysis plan of its table (need
// `preregistration-plan`, project/plan.ts): "Make this the plan" when the
// table has none; otherwise the deviation chip ("Planned: two-tailed Welch
// t test, n = 8 per group. Now: paired t test. Add a reason or revert.")
// with a reason per deviation, Revert to the plan and Lock the plan.
import { useId, useMemo, useState } from "react";
import { useProject } from "../app/context";
import { renameForOptions } from "../app/resultsName";
import { useUi } from "../app/ui";
import { SRC } from "../guide/sources";
import { newId } from "../project/ids";
import { addSheets, makeInfoSheet, uniqueName, updateResultsOptions } from "../project/ops";
import {
  chipText, explainDeviation, isDescriptive, lockPlan, planFromResults, planSheetFor,
  primarySheet, resultsOf, setPlan, sheetDeviations, type Deviation,
} from "../project/plan";
import type { DataSheet, ResultsSheet } from "../project/types";
import { isAssayAnalysis } from "../sheets/assays";
import { analysisDef } from "../sheets/registry";

/** Tables whose tests a plan names (curve fits and assays plan elsewhere). */
const PLANNABLE = new Set(["column", "grouped", "nested", "contingency", "survival"]);
import "./planCheck.css";

const now = () => new Date().toISOString();

function DeviationRow({ d, onReason, readOnly }: {
  d: Deviation; onReason: (reason: string) => void; readOnly: boolean;
}) {
  const [text, setText] = useState(d.reason ?? "");
  const id = useId();
  return (
    <li className={d.reason ? "plan-dev explained" : "plan-dev"}>
      <span className="plan-dev-text">{d.text.replace(/^./, (c) => c.toUpperCase())}.</span>
      {d.reason && <span className="plan-dev-reason">Reason: {d.reason}</span>}
      {!readOnly && (
        <span className="plan-dev-form">
          <label htmlFor={id} className="sr-only">Reason for: {d.text}</label>
          <input id={id} value={text} placeholder="Why the analysis departs from the plan"
            onChange={(e) => setText(e.target.value)} />
          <button type="button" disabled={!text.trim() || text.trim() === d.reason}
            onClick={() => onReason(text)}>{d.reason ? "Update reason" : "Record reason"}</button>
        </span>
      )}
    </li>
  );
}

export default function PlanCheck({ sheet, data, readOnly }: {
  sheet: ResultsSheet; data: DataSheet; readOnly: boolean;
}) {
  const { project, apply, select } = useProject();
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const ps = planSheetFor(project, data.id);
  const label = analysisDef(data.table.type, sheet.analysis)?.label;
  const sheets = useMemo(() => resultsOf(project, data.id), [project, data.id]);
  const devs = useMemo(() => (ps ? sheetDeviations(ps.plan, { id: sheet.id, name: sheet.name,
    analysisId: sheet.analysis, options: sheet.options }, data.table, sheets, label) : []),
  [ps, sheet, data.table, sheets, label]);

  if (!ps) {
    if (readOnly || isDescriptive(sheet.analysis, sheet.options) || !PLANNABLE.has(data.table.type)
      || isAssayAnalysis(sheet.analysis)) return null;
    const make = () => {
      const id = newId();
      const plan = planFromResults({ id: sheet.id, name: sheet.name, analysisId: sheet.analysis,
        options: sheet.options }, data.table, now(), label);
      apply((p) => addSheets(p, [{ ...makeInfoSheet(id, uniqueName(p, `Analysis plan: ${data.name}`), data.id),
        constants: [], plan }]));
      ui.notify(`Analysis plan written for “${data.name}”: lock it before the data are analysed.`);
    };
    return (
      <p className="plan-strip">
        <button type="button" className="linkish" onClick={make}>Make this the plan</button>{" "}
        <span>record this test, its sidedness, n per group and α as the analysis plan of
          “{data.name}”; later results are checked against it.</span>
      </p>
    );
  }

  const plan = ps.plan;
  const primary = primarySheet(plan, sheets);
  const unexplained = devs.filter((d) => !d.reason);
  const state = unexplained.length ? "warn" : devs.length ? "info" : "ok";
  const text = chipText(plan, devs);
  const revertible = primary?.id === sheet.id && plan.test.analysisId === sheet.analysis
    && devs.some((d) => d.kind === "test" || d.kind === "sidedness" || d.kind === "comparison");
  const record = (d: Deviation, reason: string) => apply((p) => {
    const cur = planSheetFor(p, data.id);
    if (!cur) return p;
    const r = explainDeviation(cur.plan, d, reason, now());
    return "plan" in r ? setPlan(p, cur.id, r.plan) : p;
  });
  return (
    <div className="plan-check" role="region" aria-label="Analysis plan check">
      <button type="button" className={`guide-chip chip-${state} plan-chip`} aria-expanded={open}
        aria-controls={detailId} onClick={() => setOpen(!open)}>
        <span className="chip-icon" aria-hidden="true">{state === "warn" ? "!" : state === "ok" ? "✓" : "i"}</span>
        <span className="sr-only">{state === "warn" ? "Check: " : "Note: "}</span>
        {text}
      </button>
      {open && (
        <div id={detailId} className={`guide-chip-detail chip-${state} plan-detail`}>
          <p>
            Analysis plan “{ps.name}”, written {plan.writtenAt.slice(0, 10)}
            {plan.locked ? `, locked${plan.lockedAt ? ` ${plan.lockedAt.slice(0, 10)}` : ""}` : " (not locked yet)"}.
            {devs.length ? " Each departure from the plan needs a reason; the methods text lists "
              + "them with their reasons." : " This analysis matches the plan."}
          </p>
          {devs.length > 0 && (
            <ul className="plan-devs" aria-label="Deviations from the plan">
              {devs.map((d) => <DeviationRow key={d.key} d={d} readOnly={readOnly}
                onReason={(r) => record(d, r)} />)}
            </ul>
          )}
          <p className="guide-chip-action">
            {revertible && !readOnly && (
              <button type="button" onClick={() => apply((p) => renameForOptions(
                updateResultsOptions(p, sheet.id, () => ({ ...plan.test.options })), sheet.id,
                sheet.options, analysisDef))}>Revert to the plan</button>
            )}{" "}
            {!plan.locked && !readOnly && (
              <button type="button" onClick={() => apply((p) => setPlan(p, ps.id, lockPlan(plan, now())))}>
                Lock the plan</button>
            )}{" "}
            <button type="button" className="linkish" onClick={() => select(ps.id)}>Open the analysis plan</button>
          </p>
          <p className="guide-chip-sources">
            {[SRC.gpDontPHack, SRC.motulsky2014, SRC.arriveProtocol].map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="guide-source">{s.label}</a>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
