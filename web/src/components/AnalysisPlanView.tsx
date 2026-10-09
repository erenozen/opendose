// The analysis plan on an info sheet (need `preregistration-plan`,
// project/plan.ts): primary outcome and comparison, the test with its
// sidedness, n per group, the exclusion rule and α. A draft is edited
// freely; once locked, every change needs a reason and is logged. The
// results of the linked table are checked against it (components/
// PlanCheck), and the methods text states the plan with its deviations.
import { useEffect, useId, useMemo, useState } from "react";
import { useProject } from "../app/context";
import { SRC } from "../guide/sources";
import {
  changeLog, editPlan, lockPlan, planDeviations, planMethodsSentence, resultsOf, setPlan, testLabel,
  type AnalysisPlan, type PlanPatch, type PlannedTest,
} from "../project/plan";
import type { InfoSheet } from "../project/types";
import "./planCheck.css";

/** Tests a plan can name (analysis id + the options that define it). */
const PLAN_TESTS: { id: string; analysisId: string; options: Record<string, unknown> }[] = [
  { id: "welch", analysisId: "column", options: { analysis: "ttest", ttestKind: "welch" } },
  { id: "unpaired", analysisId: "column", options: { analysis: "ttest", ttestKind: "unpaired" } },
  { id: "paired", analysisId: "column", options: { analysis: "ttest", ttestKind: "paired" } },
  { id: "ratio_paired", analysisId: "column", options: { analysis: "ttest", ttestKind: "ratio_paired" } },
  { id: "mann_whitney", analysisId: "column", options: { analysis: "ttest", ttestKind: "mann_whitney" } },
  { id: "anova_tukey", analysisId: "column", options: { analysis: "anova", anovaKind: "parametric", anovaSd: "equal", comparisons: "tukey" } },
  { id: "anova_dunnett", analysisId: "column", options: { analysis: "anova", anovaKind: "parametric", anovaSd: "equal", comparisons: "dunnett" } },
  { id: "welch_anova", analysisId: "column", options: { analysis: "anova", anovaKind: "parametric", anovaSd: "unequal" } },
  { id: "kruskal", analysisId: "column", options: { analysis: "anova", anovaKind: "nonparametric", dunnCorrected: true } },
  { id: "rm_anova", analysisId: "column", options: { analysis: "rm_anova", rmKind: "parametric" } },
  { id: "two_way", analysisId: "grouped_two_way", options: { design: "none", comparisons: "sidak" } },
];

const now = () => new Date().toISOString();

export default function AnalysisPlanView({ sheet }: { sheet: InfoSheet & { plan: AnalysisPlan } }) {
  const { project, apply, select } = useProject();
  const plan = sheet.plan;
  const ro = !!sheet.frozen;
  const [draft, setDraft] = useState<AnalysisPlan>(plan);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(plan); setError(null); }, [plan]);
  const v = plan.locked ? draft : plan;
  const ids = { out: useId(), n: useId(), excl: useId(), alpha: useId(), test: useId(),
    tails: useId(), a: useId(), b: useId(), groups: useId(), reason: useId() };

  const change = (patch: PlanPatch, key: string) => {
    if (plan.locked) { setDraft((d) => ({ ...d, ...patch } as AnalysisPlan)); return; }
    apply((p) => {
      const r = editPlan(plan, patch, "", now());
      return "plan" in r ? setPlan(p, sheet.id, r.plan) : p;
    }, `plan:${sheet.id}:${key}`);
  };
  const dirty = plan.locked && JSON.stringify(draft) !== JSON.stringify(plan);
  const saveChange = () => {
    const patch: PlanPatch = { primaryOutcome: draft.primaryOutcome, groups: draft.groups,
      comparison: draft.comparison, test: draft.test, nPerGroup: draft.nPerGroup,
      exclusionRule: draft.exclusionRule, alpha: draft.alpha };
    const r = editPlan(plan, patch, reason, now());
    if ("error" in r) { setError(r.error); return; }
    apply((p) => setPlan(p, sheet.id, r.plan));
    setReason("");
  };

  const data = project.sheets.find((s) => s.id === sheet.parentId);
  const table = data?.kind === "data" ? data.table : null;
  const devs = useMemo(() => (table && sheet.parentId
    ? planDeviations(plan, table, resultsOf(project, sheet.parentId)) : []), [plan, table, project, sheet.parentId]);
  const testId = PLAN_TESTS.find((t) => t.analysisId === v.test.analysisId
    && Object.entries(t.options).every(([k, x]) => v.test.options[k] === x))?.id ?? "current";
  const setTest = (id: string) => {
    const t = PLAN_TESTS.find((x) => x.id === id);
    if (!t) return;
    const test: PlannedTest = { analysisId: t.analysisId, options: t.options,
      label: testLabel(t.analysisId, t.options), tails: v.test.tails };
    change({ test }, "test");
  };
  const groups = v.groups;
  const num = (s: string) => { const x = Number(s); return s.trim() && Number.isFinite(x) ? x : null; };

  return (
    <section className="result-card plan-sheet" aria-labelledby="plan-h">
      <h3 id="plan-h">Analysis plan</h3>
      <div className="plan-status">
        <span className={`plan-badge${plan.locked ? " locked" : ""}`}>
          {plan.locked ? `Locked${plan.lockedAt ? ` ${plan.lockedAt.slice(0, 10)}` : ""}` : "Draft"}</span>
        <span>Written {plan.writtenAt.slice(0, 10)}{data ? <> for “{data.name}”</> : " (link it to a data table below)"}.</span>
        {!plan.locked && !ro && (
          <button type="button" className="btn-primary" onClick={() => apply((p) => setPlan(p, sheet.id, lockPlan(plan, now())))}>
            Lock the plan</button>
        )}
      </div>
      <p className="hint-block">
        {plan.locked
          ? "Locked: the plan is not edited silently. A change needs a reason and is kept in the log below; results that depart from it are flagged and the methods text lists the deviations."
          : "Write the plan before collecting or looking at the data, then lock it. Results of the linked table are checked against it."}
      </p>
      <div className="plan-fields">
        <label className="field" htmlFor={ids.out}><span>Primary outcome</span>
          <input id={ids.out} value={v.primaryOutcome} readOnly={ro} placeholder="e.g. tumour volume at day 21 (mm³)"
            onChange={(e) => change({ primaryOutcome: e.target.value }, "out")} /></label>
        <label className="field" htmlFor={ids.groups}><span>Groups</span>
          <input id={ids.groups} value={groups.join(", ")} readOnly={ro} placeholder="Control, Treated"
            onChange={(e) => change({ groups: e.target.value.split(",").map((g) => g.trim()) }, "groups")} /></label>
        <label className="field" htmlFor={ids.a}><span>Primary comparison: reference group</span>
          <select id={ids.a} value={v.comparison?.a ?? ""} disabled={ro}
            onChange={(e) => change({ comparison: e.target.value
              ? { a: e.target.value, b: v.comparison?.b ?? groups.find((g) => g !== e.target.value) ?? "" } : null }, "cmp")}>
            <option value="">(no single comparison)</option>
            {groups.filter(Boolean).map((g) => <option key={g} value={g}>{g}</option>)}
          </select></label>
        <label className="field" htmlFor={ids.b}><span>Primary comparison: compared group</span>
          <select id={ids.b} value={v.comparison?.b ?? ""} disabled={ro || !v.comparison}
            onChange={(e) => v.comparison && change({ comparison: { a: v.comparison.a, b: e.target.value } }, "cmp")}>
            <option value="">(choose)</option>
            {groups.filter((g) => g && g !== v.comparison?.a).map((g) => <option key={g} value={g}>{g}</option>)}
          </select></label>
        <label className="field" htmlFor={ids.test}><span>Test</span>
          <select id={ids.test} value={testId} disabled={ro} onChange={(e) => setTest(e.target.value)}>
            {testId === "current" && <option value="current">{v.test.label}</option>}
            {PLAN_TESTS.map((t) => <option key={t.id} value={t.id}>{testLabel(t.analysisId, t.options)}</option>)}
          </select></label>
        <label className="field" htmlFor={ids.tails}><span>P values</span>
          <select id={ids.tails} value={v.test.tails} disabled={ro}
            onChange={(e) => change({ test: { ...v.test, tails: e.target.value === "one" ? "one" : "two" } }, "tails")}>
            <option value="two">Two-tailed</option>
            <option value="one">One-tailed (direction stated now, before the data)</option>
          </select></label>
        <label className="field" htmlFor={ids.n}><span>n per group (independent units)</span>
          <input id={ids.n} inputMode="numeric" value={v.nPerGroup ?? ""} readOnly={ro}
            onChange={(e) => { const x = num(e.target.value); change({ nPerGroup: x !== null && x > 0 ? Math.round(x) : null }, "n"); }} /></label>
        <label className="field" htmlFor={ids.alpha}><span>α (significance level)</span>
          <input id={ids.alpha} inputMode="decimal" value={v.alpha} readOnly={ro}
            onChange={(e) => { const x = num(e.target.value); if (x !== null && x > 0 && x < 1) change({ alpha: x }, "alpha"); }} /></label>
        <label className="field plan-wide" htmlFor={ids.excl}><span>Exclusion rule (blank: no exclusions)</span>
          <textarea id={ids.excl} rows={2} value={v.exclusionRule} readOnly={ro}
            placeholder="e.g. animals reaching the humane endpoint before day 21; wells flagged by the plate reader"
            onChange={(e) => change({ exclusionRule: e.target.value }, "excl")} /></label>
      </div>
      {v.test.tails === "one" && (
        <p className="hint-block">
          A one-tailed P is only legitimate when the direction was recorded before the data and a
          difference the other way would be treated as no difference. Write the predicted
          direction in the primary outcome.
        </p>
      )}
      {plan.locked && dirty && !ro && (
        <div className="plan-reason">
          <label className="field" htmlFor={ids.reason}><span>Reason for the change (required: the plan is locked)</span>
            <input id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button type="button" className="btn-primary" disabled={!reason.trim()} onClick={saveChange}>
            Save the change</button>
          <button type="button" onClick={() => { setDraft(plan); setReason(""); setError(null); }}>Discard</button>
          {error && <p className="plan-error" role="alert">{error}</p>}
        </div>
      )}
      {devs.length > 0 && (
        <>
          <h4>Deviations in the results</h4>
          <ul className="plan-log" aria-label="Deviations in the results">
            {devs.map((d) => (
              <li key={`${d.sheetId}:${d.key}`}>
                <button type="button" className="linkish" onClick={() => select(d.sheetId)}>
                  {d.text.replace(/^./, (c) => c.toUpperCase())}</button>
                {d.reason ? ` (reason: ${d.reason})` : " (no reason recorded)"}
              </li>
            ))}
          </ul>
        </>
      )}
      {plan.changes.length > 0 && (
        <>
          <h4>Change log</h4>
          <ul className="plan-log" aria-label="Change log">{changeLog(plan).map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}
      {plan.designNotes?.length ? (
        <>
          <h4>Design checks when the experiment was planned</h4>
          <ul className="plan-log">{plan.designNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      ) : null}
      <h4>In the methods text</h4>
      <p className="plan-methods">{planMethodsSentence(plan, devs)}</p>
      <p className="plan-sources">
        {[SRC.gpDontPHack, SRC.motulsky2014, SRC.gpTails, SRC.arriveProtocol].map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
        ))}
      </p>
    </section>
  );
}
