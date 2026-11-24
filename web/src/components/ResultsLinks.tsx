// Links that make existing features reachable from a results sheet and
// from the empty results pane: how this analysis is validated, planning
// the next experiment (power, pre-filled with this data's SD), the reason
// "Help me choose…" gave for the test, Cox regression from a survival
// analysis and Compare fits from a curve fit.
import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../app/context";
import { newId } from "../project/ids";
import { familyChildren, findSheet } from "../project/ops";
import type { DataTableModel, ResultsSheet } from "../project/types";
import { addConfiguredAnalysis } from "../guide/actions";
import { currentChoice, withoutChoice } from "../guide/choice";
import { useGuideOptional } from "../guide/context";
import { comparable } from "../sheets/xy/compareFits";
import { MODELS_META } from "../lib/modelLibrary";
import { openPowerTool } from "../power/events";
import { pilotFromResult } from "../power/pilot";
import { openValidation } from "../share/events";
import { checksIn, validationScope, validationSentence } from "../share/validationIndex";
import { compareFitsOptions, offersPlanning } from "./resultsLinks";
import { Button, IconButton, notify } from "./ui";
import { CloseIcon } from "./ui/feedbackIcons";
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

/** In the Checks row of every results sheet: why this test was chosen
 *  (when Help me choose picked it), how it is validated, and planning
 *  the next experiment. */
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
  // Saved with the sheet; gone once an option the chooser set is changed.
  const chosen = currentChoice(sheet);
  const { apply, undo, readOnly } = useProject();
  const firstLink = useRef<HTMLButtonElement>(null);
  // Removing edits the saved project and its methods paragraph: say so,
  // offer Undo, and keep focus in the row (the button itself goes away).
  const removeWhy = () => {
    apply((p) => withoutChoice(p, sheet.id));
    firstLink.current?.focus();
    notify("Removed why this test from this sheet and its methods paragraph.",
      { tone: "success", action: { label: "Undo", onAction: undo } });
  };
  return (
    <>
      {chosen && (
        <div className="results-why" role="note" aria-label="Why this test">
          <p><strong>Why {chosen.test}.</strong> {chosen.reason}</p>
          {!readOnly && (
            <IconButton size="sm" aria-label="Remove why this test" onClick={removeWhy}>
              <CloseIcon /></IconButton>
          )}
        </div>
      )}
      <nav className="results-links" aria-label="About these results">
        <span className="results-link">
          <button type="button" data-still className="linkish" ref={firstLink}
            onClick={() => openValidation({ analysisId: sheet.analysis, options })}>
            How this is validated</button>
          {sentence && <span className="results-link-note">{sentence.replace(/^Checked/, "checked")
            .replace(/\.$/, "")}</span>}
        </span>
        {plan && (
          <span className="results-link">
            <button type="button" data-still className="linkish"
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
          <Button variant="primary" onClick={guide.openWizard}>Help me choose…</Button>
          <span>Answer a few questions about this table; get a test with its reason.</span>
        </li>
      )}
      {guide && (
        <li>
          <Button onClick={guide.openPlanner}>Plan an experiment…</Button>
          <span>Before the data: the table, the analysis, n and design checks, saved as an analysis plan.</span>
        </li>
      )}
      <li>
        <Button onClick={() => openPowerTool("power")}>Sample size (power)…</Button>
        <span>How many animals or replicates you need, with a justification sentence.</span>
      </li>
      <li>
        <Button onClick={() => openValidation()}>How OpenDose is validated</Button>
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
      <button type="button" data-still className="linkish" disabled={readOnly}
        onClick={() => open("cox", {}, true)}>
        Cox regression (hazard ratios with covariates)</button>{" "}
      <span>on the same table: hazard ratios with confidence intervals adjusted for
        covariates (extra subcolumns after Time and Event), the proportional-hazards test
        and a forest plot.</span>
    </p>
  );
}

/** Survival results on a table with event codes 2, 3, … (P-90): the
 *  competing-risks analysis on the same table. */
export function CompetingLink({ sheet }: { sheet: ResultsSheet }) {
  const { open, readOnly } = useOpenAnalysis(sheet);
  return (
    <p className="results-crosslink">
      <button type="button" data-still className="linkish" disabled={readOnly}
        onClick={() => open("competing_risks", {}, true)}>
        Competing risks (cumulative incidence)</button>{" "}
      <span>on the same table: the rows with event codes 2, 3, … are other kinds of event,
        left out above. The cumulative incidence of each kind and Gray&apos;s test use them.</span>
    </p>
  );
}

/** Curve-fit results: Compare fits on the same table, set up from this fit. */
export function CompareFitsLinks({ sheet, table, model, xIsLog, weighting = "none", weightK }: {
  sheet: ResultsSheet;
  table: DataTableModel;
  model: string;
  xIsLog: boolean;
  /** The fit's weighting, carried into the comparison. */
  weighting?: string;
  weightK?: number;
}) {
  const { open, readOnly } = useOpenAnalysis(sheet);
  const usable = (id: string) => !!MODELS_META[id] && comparable(MODELS_META[id]);
  const sets = table.datasets.filter((d) => d.rows.some((r) => r.some((v) => v.trim()))).length;
  return (
    <p className="results-crosslink">
      <span>Compare fits (extra sum-of-squares F test and AICc):</span>{" "}
      <button type="button" data-still className="linkish" disabled={readOnly}
        onClick={() => open("compare_fits", compareFitsOptions(model, xIsLog, "models", usable, { weighting, weightK }), false)}>
        Compare with another model…</button>
      {sets >= 2 && (
        <>
          {" · "}
          <button type="button" data-still className="linkish" disabled={readOnly}
            onClick={() => open("compare_fits", compareFitsOptions(model, xIsLog, "global", usable, { weighting, weightK }), false)}>
            Compare with another data set…</button>
          {" · "}
          <button type="button" data-still className="linkish" disabled={readOnly}
            onClick={() => open("compare_fits", compareFitsOptions(model, xIsLog, "parameter", usable, { weighting, weightK }), false)}>
            Compare a parameter (EC50 ratio)…</button>
        </>
      )}
    </p>
  );
}
