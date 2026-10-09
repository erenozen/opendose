// "Plan an experiment…" (need `design-stage-checks`): the "Which test?"
// design questions asked before any data exist (the same component, no
// table), plus what each value is, how many independent units per group
// and whether samples are pooled. It produces the planned table (empty,
// with the right layout and titles), the planned analysis pre-configured,
// a suggested n from the power engine (a priori, from the smallest
// difference that matters; never post hoc), a sourced design check list
// (guide/designChecks.ts) and "Save as analysis plan" (project/plan.ts).
import { useEffect, useId, useMemo, useState } from "react";
import { useProject } from "../app/context";
import { addFamily } from "../app/factory";
import { renameForOptions } from "../app/resultsName";
import Modal from "../components/Modal";
import "../components/planCheck.css";
import { analyzeAsync, isCancelled } from "../lib/engine";
import { openPowerTool } from "../power/events";
import { nForCurve, powerPayload, type PowerResult } from "../power/power";
import { newId } from "../project/ids";
import { addSheets, findSheet, makeInfoSheet, uniqueName } from "../project/ops";
import { planFromResults, setPlan } from "../project/plan";
import type { DataTableModel, TableType } from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";
import { addConfiguredAnalysis } from "./actions";
import { rememberChoice } from "./choice";
import {
  checkLines, DEFAULT_PLAN_ANSWERS, defaultGroupNames, designChecks, plannedLayout, plannedPowerForm,
  tableAnswers, type PlanAnswers,
} from "./designChecks";
import { recommendTable } from "./designToTable";
import { DEFAULT_DESIGN, recommend, type Design } from "./recommend";
import { tableWording } from "./tablePrefill";
import { Choice, DesignQuestions } from "./WhichTest";

const NO_WORDS = tableWording(undefined);
const num = (s: string) => { const v = Number(s.trim().replace(",", ".")); return s.trim() && Number.isFinite(v) ? v : null; };

export default function PlanExperiment({ onClose }: { onClose: () => void }) {
  const { apply, select, readOnly } = useProject();
  const [d, setD] = useState<Design>({ ...DEFAULT_DESIGN });
  const set = (patch: Partial<Design>) => setD((x) => ({ ...x, ...patch }));
  const [a, setA] = useState<PlanAnswers>(DEFAULT_PLAN_ANSWERS);
  const setAns = (patch: Partial<PlanAnswers>) => setA((x) => ({ ...x, ...patch }));
  const names = defaultGroupNames(d);
  const [groups, setGroups] = useState<string | null>(null);
  const [rowLevels, setRowLevels] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [units, setUnits] = useState("");
  const [delta, setDelta] = useState("");
  const [sd, setSd] = useState("");
  const [power, setPower] = useState<PowerResult | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);
  const ids = { out: useId(), groups: useId(), rows: useId(), units: useId(), delta: useId(), sd: useId() };

  const rec = useMemo(() => recommend(d, null), [d]);
  const checks = useMemo(() => designChecks(d, { ...a, unitsPerGroup: num(units) }), [d, a, units]);
  const twoFactor = d.outcome === "continuous" && (d.differential || d.factors !== "one");
  const groupText = groups ?? names.datasets.join(", ");
  const rowText = rowLevels ?? names.rows.join(", ");
  const tableRec = useMemo(() => recommendTable(tableAnswers(d)), [d]);
  const tableType = rec.target?.tableType ?? tableRec.type;
  const layoutText = tableRec.type === tableType ? `${tableRec.title}. ${tableRec.layout}` : rec.target?.layout ?? "";

  // Suggested n: the power engine, a priori, from the difference that
  // matters and the expected SD (never from data).
  const form = useMemo(() => plannedPowerForm(d, num(delta), num(sd), "animals"), [d, delta, sd]);
  useEffect(() => {
    setPower(null); setPowerError(null);
    if (!form) return;
    const p = powerPayload(form);
    if ("error" in p) { setPowerError(p.error); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      analyzeAsync(p.payload, { signal: ctl.signal, priority: "user" }).then((r) => {
        const res = r as PowerResult;
        if (res.error) setPowerError(String(res.error)); else setPower(res);
      }, (e) => { if (!isCancelled(e)) setPowerError(e instanceof Error ? e.message : String(e)); });
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [form]);
  const suggested = power ? Math.ceil(nForCurve(power)) : null;
  const nPlanned = num(units) ?? suggested;

  const create = (withPlan: boolean) => {
    const target = rec.target;
    if (!target) return;
    const def = tableDef(target.tableType as TableType);
    const lay = plannedLayout(target.tableType, d, groupText, rowText, nPlanned);
    const base = def.defaultTable(lay.init);
    const table: DataTableModel = {
      ...base,
      yTitle: outcome.trim() || base.yTitle,
      datasets: base.datasets.map((c, i) => ({ ...c, name: lay.datasets[i] ?? c.name })),
      rowTitles: base.rowTitles.map((t, i) => lay.rowTitles[i] ?? t),
    };
    const name = outcome.trim() ? `${outcome.trim()} (planned)` : "Planned experiment";
    let goTo: string | null = null;
    let resultsId: string | null = null;
    apply((p) => {
      const fam = addFamily(p, table, uniqueName(p, name), newId, { analysis: null });
      const r = addConfiguredAnalysis(fam.project, fam.dataId, target, newId);
      resultsId = r.resultsId;
      goTo = r.resultsId ?? fam.dataId;
      // Named after the test it runs ("t test of …").
      let out = r.resultsId ? renameForOptions(r.project, r.resultsId, {}, analysisDef) : r.project;
      const res = findSheet(out, r.resultsId);
      if (withPlan && res?.kind === "results") {
        const at = new Date().toISOString();
        const made = planFromResults({ id: res.id, name: res.name, analysisId: res.analysis,
          options: res.options }, table, at, rec.test);
        const planId = newId();
        out = addSheets(out, [{ ...makeInfoSheet(planId, uniqueName(out, `Analysis plan: ${table.yTitle.trim() || "planned experiment"}`),
          fam.dataId), constants: [] }]);
        out = setPlan(out, planId, { ...made, primaryOutcome: outcome.trim(), nPerGroup: nPlanned,
          designNotes: [...checkLines(checks), ...(power?.justification?.text
            ? [`Sample size: ${power.justification.text}`] : [])] });
        goTo = planId;
      }
      return out;
    });
    if (resultsId) rememberChoice(resultsId, { test: rec.test, reason: rec.reason });
    onClose();
    if (goTo) select(goTo);
  };

  return (
    <Modal title="Plan an experiment" className="modal-wide which-test plan-exp" onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!rec.target || readOnly} onClick={() => create(false)}>
            Create the table</button>
          <button type="button" className="btn-primary" disabled={!rec.target || readOnly}
            onClick={() => create(true)}>Save as analysis plan</button>
        </>
      }>
      <p className="modal-text">
        Answer before collecting any data. You get the table to fill in, the analysis set up, a
        sample size from the power calculation and a list of design checks. “Save as analysis
        plan” creates the table too, with a plan that later results are checked against.
      </p>
      <div className="wt-grid">
        <div className="wt-questions">
          <label className="wt-field" htmlFor={ids.out}><span>Primary outcome</span>
            <input id={ids.out} value={outcome}
              placeholder="what you will measure, with its unit" onChange={(e) => setOutcome(e.target.value)} /></label>
          <DesignQuestions d={d} set={set} words={NO_WORDS} hasChecks={false} />
          {twoFactor && (
            <label className="wt-field" htmlFor={ids.rows}><span>Treatments (rows)</span>
              <input id={ids.rows} value={rowText}
                onChange={(e) => setRowLevels(e.target.value)} /></label>
          )}
          <label className="wt-field" htmlFor={ids.groups}>
            <span>{twoFactor ? "Groups compared (data sets)" : "Groups"}</span>
            <input id={ids.groups} value={groupText}
              onChange={(e) => setGroups(e.target.value)} /></label>
          <label className="wt-field" htmlFor={ids.units}>
            <span>Independent units per group (animals, cultures, experiments)</span>
            <input id={ids.units} inputMode="numeric" value={units} placeholder={suggested ? String(suggested) : ""}
              onChange={(e) => setUnits(e.target.value)} /></label>
          <Choice legend="Are the samples of a group pooled before measuring?" value={a.pooled ? "yes" : "no"}
            options={[["no", "No, each unit is measured separately"], ["yes", "Yes, one pooled sample per group"]]}
            onChange={(v) => setAns({ pooled: v === "yes" })} />
          <Choice legend="Is the treatment given to each unit separately?" value={a.shared ? "shared" : "each"}
            options={[["each", "Yes, to each animal or culture"], ["shared", "No, to a whole cage, tank or dish"]]}
            onChange={(v) => setAns({ shared: v === "shared" })} />
          <Choice legend="Is there a vehicle or untreated control group?" value={a.control}
            options={[["yes", "Yes"], ["no", "No"], ["not_needed", "Not needed (say why)"]]}
            onChange={(v) => setAns({ control: v })} />
          <Choice legend="How will units be allocated to groups?" value={a.randomised}
            options={[["list", "At random, from a randomisation list"], ["no", "Not planned yet"]]}
            onChange={(v) => setAns({ randomised: v })} />
          <Choice legend="Will whoever measures the outcome know the groups?" value={a.blinded}
            options={[["yes", "No, they are blinded"], ["no", "Yes, or not planned yet"]]}
            onChange={(v) => setAns({ blinded: v })} />
          {d.outcome === "continuous" && d.groups !== "one" && !twoFactor && (
            <div className="plan-numbers">
              <label className="wt-field" htmlFor={ids.delta}><span>Smallest difference that matters</span>
                <input id={ids.delta} inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} /></label>
              <label className="wt-field" htmlFor={ids.sd}><span>Expected SD (earlier work, literature)</span>
                <input id={ids.sd} inputMode="decimal" value={sd} onChange={(e) => setSd(e.target.value)} /></label>
            </div>
          )}
        </div>
        <section className="wt-result" aria-live="polite" aria-label="Planned experiment">
          <p className="wt-eyebrow">Planned analysis</p>
          <h3 className="wt-test">{rec.test}</h3>
          <p>{rec.reason}</p>
          {layoutText && <p className="wt-table-note"><strong>Planned table:</strong> {layoutText}</p>}
          <h4>Sample size</h4>
          <p className="plan-n" aria-label="Suggested sample size">
            {suggested !== null
              ? <>Suggested: <strong>{suggested} per group</strong> for 80% power (two-sided α = 0.05).
                {power?.justification?.text ? ` ${power.justification.text}` : ""}</>
              : powerError ? `Power calculation: ${powerError}`
                : form === null && d.outcome === "continuous" && d.groups !== "one" && !twoFactor
                  ? "Enter the smallest difference that matters and the expected SD for a suggested n."
                  : "Use the power tool for this design."}
          </p>
          <p className="guide-chip-action">
            <button type="button" className="linkish" onClick={() => openPowerTool("power")}>
              Open the power tool…</button>{" "}
            <span className="wt-hint">planned from a difference that matters, never from the
              effect a finished experiment observed.</span>
          </p>
          <h4>Design checks</h4>
          <ul className="plan-checks" aria-label="Design checks">
            {checks.map((c) => (
              <li key={c.id} className={c.state} data-check={c.id}>
                <p className="plan-check-title">{c.title}</p>
                <p>{c.detail}</p>
                {c.action === "random" && (
                  <button type="button" className="linkish" onClick={() => openPowerTool("random")}>
                    Make a randomisation list…</button>
                )}
                {c.action === "power" && (
                  <button type="button" className="linkish" onClick={() => openPowerTool("power")}>
                    Open the power tool…</button>
                )}
                <p className="wt-sources">
                  {c.sources.map((s, i) => (
                    <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
          {rec.notes.length > 0 && (
            <ul className="wt-notes">{rec.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
          <p className="wt-sources">
            Sources: {rec.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && "; "}
                <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
            ))}
          </p>
        </section>
      </div>
    </Modal>
  );
}
