// Links that make existing features reachable from a results sheet and
// from the empty results pane: how this analysis is validated, planning
// the next experiment (power, pre-filled with this data's SD), the reason
// "Help me choose…" gave for the test, Cox regression from a survival
// analysis and Compare fits from a curve fit.
import { useEffect, useMemo, useState } from "react";
import { useProject } from "../app/context";
import { newId } from "../project/ids";
import { familyChildren, findSheet } from "../project/ops";
import type { DataTableModel, ResultsSheet } from "../project/types";
import { addConfiguredAnalysis } from "../guide/actions";
import { choiceFor, forgetChoice } from "../guide/choice";
import { useGuideOptional } from "../guide/context";
import { comparable } from "../sheets/xy/compareFits";
import { MODELS_META } from "../lib/modelLibrary";
import { openPowerTool } from "../power/events";
import { pilotFromResult } from "../power/pilot";
import { openValidation } from "../share/events";
import { checksIn, validationScope, validationSentence } from "../share/validationIndex";
import { compareFitsOptions, offersPlanning } from "./resultsLinks";
import "./resultsLinks.css";

type CheckList = { group: string; analysis: string }[];
// The checks load with the first results sheet, in a chunk of their own
// (the validation page uses the same file).
let checksLoad: Promise<CheckList> | null = null;
function useChecks(): CheckList | null {
  const [checks, setChecks] = useState<CheckList | null>(null);
  useEffect(() => {
    let live = true;
    checksLoad ??= import("../share/validation.json").then((m) =>
      (m.default as { checks: CheckList }).checks);
    void checksLoad.then((c) => { if (live) setChecks(c); }, () => {});
    return () => { live = false; };
  }, []);
  return checks;
}

/** Under the results chips of every results sheet. */
export default function ResultsLinks({ sheet, tableName, options, result }: {
  sheet: ResultsSheet;
  tableName: string;
  options: unknown;
  result: unknown;
}) {
  const checks = useChecks();
  const sentence = useMemo(() => (checks ? validationSentence(
    checksIn(checks, validationScope(sheet.analysis, options))) : ""), [checks, sheet.analysis, options]);
  const plan = offersPlanning(sheet.analysis, options);
  const pilot = useMemo(() => (plan ? pilotFromResult(sheet.analysis, options, result, tableName)
    : null), [plan, sheet.analysis, options, result, tableName]);
  const [chosen, setChosen] = useState(() => choiceFor(sheet.id));
  return (
    <>
      {chosen && (
        <div className="results-why" role="note" aria-label="Why this test">
          <p><strong>Why {chosen.test}.</strong> {chosen.reason}</p>
          <button type="button" className="dismiss" aria-label="Dismiss why this test"
            onClick={() => { forgetChoice(sheet.id); setChosen(null); }}>×</button>
        </div>
      )}
      <nav className="results-links" aria-label="About these results">
        <span className="results-link">
          <button type="button" className="linkish"
            onClick={() => openValidation({ analysisId: sheet.analysis, options })}>
            How this is validated</button>
          {sentence && <span className="results-link-note">{sentence.replace(/^Checked/, "checked")
            .replace(/\.$/, "")}</span>}
        </span>
        {plan && (
          <span className="results-link">
            <button type="button" className="linkish"
              onClick={() => openPowerTool("power", pilot ?? undefined)}>
              Sample size for the next experiment…</button>
            <span className="results-link-note">{pilot
              ? "from this data's SD (pilot)" : "the power and sample size tool"}</span>
          </span>
        )}
      </nav>
    </>
  );
}

/** The empty results pane (a table without analyses): where to start. */
export function ResultsEmptyLinks() {
  const guide = useGuideOptional();
  return (
    <ul className="results-empty-links" aria-label="Where to start">
      {guide && (
        <li>
          <button type="button" className="btn-primary" onClick={guide.openWizard}>
            Help me choose…</button>
          <span>Answer a few questions about this table; get a test with its reason.</span>
        </li>
      )}
      {guide && (
        <li>
          <button type="button" onClick={guide.openPlanner}>Plan an experiment…</button>
          <span>Before the data: the table, the analysis, n and design checks, saved as an analysis plan.</span>
        </li>
      )}
      <li>
        <button type="button" onClick={() => openPowerTool("power")}>
          Sample size (power)…</button>
        <span>How many animals or replicates you need, with a justification sentence.</span>
      </li>
      <li>
        <button type="button" onClick={() => openValidation()}>How OpenDose is validated</button>
        <span>Every pinned cross-check against reference software and published examples.</span>
      </li>
    </ul>
  );
}

/** Add `analysisId` to the family of `sheet`'s table with `options`, or
 *  go to the one already there. */
function useOpenAnalysis(sheet: ResultsSheet) {
  const { project, apply, select, readOnly } = useProject();
  const open = (analysisId: string, options: Record<string, unknown>, reuse: boolean) => {
    const data = findSheet(project, sheet.parentId);
    if (!data || data.kind !== "data") return;
    const there = reuse ? familyChildren(project, data.id).find((s): s is ResultsSheet =>
      s.kind === "results" && s.analysis === analysisId) : undefined;
    if (there) { select(there.id); return; }
    let goTo: string | null = null;
    apply((p) => {
      const r = addConfiguredAnalysis(p, data.id, {
        tableType: data.table.type, analysisId, options, layout: "" }, newId);
      goTo = r.resultsId;
      return r.project;
    });
    if (goTo) select(goTo);
  };
  return { open, readOnly };
}

/** Survival results: Cox regression on the same table. */
export function CoxLink({ sheet }: { sheet: ResultsSheet }) {
  const { open, readOnly } = useOpenAnalysis(sheet);
  return (
    <p className="results-crosslink">
      <button type="button" className="linkish" disabled={readOnly}
        onClick={() => open("cox", {}, true)}>
        Cox regression (hazard ratios with covariates)</button>{" "}
      <span>on the same table: hazard ratios with confidence intervals adjusted for
        covariates (extra subcolumns after Time and Event), the proportional-hazards test
        and a forest plot.</span>
    </p>
  );
}

/** Curve-fit results: Compare fits on the same table, set up from this fit. */
export function CompareFitsLinks({ sheet, table, model, xIsLog }: {
  sheet: ResultsSheet;
  table: DataTableModel;
  model: string;
  xIsLog: boolean;
}) {
  const { open, readOnly } = useOpenAnalysis(sheet);
  const usable = (id: string) => !!MODELS_META[id] && comparable(MODELS_META[id]);
  const sets = table.datasets.filter((d) => d.rows.some((r) => r.some((v) => v.trim()))).length;
  return (
    <p className="results-crosslink">
      <span>Compare fits (extra sum-of-squares F test and AICc):</span>{" "}
      <button type="button" className="linkish" disabled={readOnly}
        onClick={() => open("compare_fits", compareFitsOptions(model, xIsLog, "models", usable), false)}>
        Compare with another model…</button>
      {sets >= 2 && (
        <>
          {" · "}
          <button type="button" className="linkish" disabled={readOnly}
            onClick={() => open("compare_fits", compareFitsOptions(model, xIsLog, "global", usable), false)}>
            Compare with another data set…</button>
          {" · "}
          <button type="button" className="linkish" disabled={readOnly}
            onClick={() => open("compare_fits", compareFitsOptions(model, xIsLog, "parameter", usable), false)}>
            Compare a parameter (EC50 ratio)…</button>
        </>
      )}
    </p>
  );
}
