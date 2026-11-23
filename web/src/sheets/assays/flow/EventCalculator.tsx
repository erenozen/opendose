// Flow cytometry event counts (FEATURE-PLAN P-50): how many events to
// acquire for a target CV at an expected frequency, and the CI of an
// observed gated percentage. Every number comes from the engine
// (api.py flow_events), recomputed 150 ms after the fields settle.
import { useEffect, useId, useState } from "react";
import Modal from "../../../components/Modal";
import { Button, Field, NumberField } from "../../../components/ui";
import { runEngine } from "../../../lib/engine";
import { num } from "../kit/format";
import { count, DEFAULT_EVENT_FIELDS, eventsPayload, type EventFields } from "./eventsModel";
import "../kit/assays.css";
import "./flow.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function EventCalculator({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<EventFields>(DEFAULT_EVENT_FIELDS);
  const set = (p: Partial<EventFields>) => setF((x) => ({ ...x, ...p }));
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const r = await runEngine((engine) => engine.analyze(eventsPayload(f)), { priority: "user" })
        .catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      if (live) setRes(r);
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [f]);
  const level = `${Math.round(f.ciLevel * 100)}%`;
  const levelId = useId();
  const plan = res?.plan;
  const obs = res?.observed;
  return (
    <Modal title="Flow cytometry event counts" className="modal-wide flow-events" onClose={onClose}
      actions={<Button onClick={onClose}>Close</Button>}>
      <section className="flow-events-part" aria-labelledby="flow-events-plan">
        <h3 id="flow-events-plan">Events to acquire</h3>
        <div className="wizard-row">
          <NumberField label="Target CV of the positive count" unit="%" min={0} max={100}
            value={f.cv} onValueChange={(v) => set({ cv: v })} />
          <NumberField label="Expected frequency" unit="% of parent" min={0} max={100}
            value={f.frequency} onValueChange={(v) => set({ frequency: v })} />
        </div>
        <p className="sr-only" role="status">
          {plan && !plan.error ? `${count(plan.positive_events)} positive events, ${count(plan.total_events)} in all.` : ""}
        </p>
        <div className="flow-events-out">
          {!res ? "Computing…" : res.error ? res.error : plan?.error ? plan.error : plan ? (
            <table className="results-table">
              <tbody>
                <tr><th scope="row">Positive events needed</th><td>{count(plan.positive_events)}</td></tr>
                <tr><th scope="row">Events to acquire in the parent gate</th><td><strong>{count(plan.total_events)}</strong></td></tr>
                <tr><th scope="row">CV with that many positive events</th><td>{num(plan.achieved_cv_pct)}%</td></tr>
              </tbody>
            </table>
          ) : "Enter a target CV and the expected frequency."}
        </div>
        <p className="assay-cite">
          Counting events is a Poisson process: r positive events have a CV of 1/√r, so a target CV needs
          1/CV² positive events, and the parent gate that many divided by the frequency (Roederer 2008,
          Cytometry A 73:384). Gating and instrument noise add to this; it is the floor.
        </p>
      </section>
      <section className="flow-events-part" aria-labelledby="flow-events-obs">
        <h3 id="flow-events-obs">Confidence interval of a gated percentage</h3>
        <div className="wizard-row">
          <NumberField label="Positive events" min={0} integer fieldClassName="field-num"
            value={f.positive} onValueChange={(v) => set({ positive: v })} />
          <NumberField label="Events in the parent gate" min={1} integer fieldClassName="field-num"
            value={f.total} onValueChange={(v) => set({ total: v })} />
          <Field label="Confidence level" id={levelId}>
            <select id={levelId} value={f.ciLevel} onChange={(e) => set({ ciLevel: Number(e.target.value) })}>
              <option value={0.9}>90%</option><option value={0.95}>95%</option><option value={0.99}>99%</option>
            </select>
          </Field>
        </div>
        <p className="sr-only" role="status">
          {obs && !obs.error ? `${num(obs.percent)}%, ${level} CI ${num(obs.ci_pct[0])}% to ${num(obs.ci_pct[1])}%.` : ""}
        </p>
        <div className="flow-events-out">
          {!res || res.error ? "" : obs?.error ? obs.error : obs ? (
            <table className="results-table">
              <tbody>
                <tr><th scope="row">Gated percentage</th><td><strong>{num(obs.percent)}%</strong></td></tr>
                <tr><th scope="row">{level} CI (Wilson)</th><td>{num(obs.ci_pct[0])}% to {num(obs.ci_pct[1])}%</td></tr>
                <tr><th scope="row">CV of the positive count</th>
                  <td>{obs.count_cv_pct != null ? `${num(obs.count_cv_pct)}%` : "none: no positive events"}</td></tr>
              </tbody>
            </table>
          ) : "Enter the positive events and the events in the parent gate."}
        </div>
        <p className="assay-cite">
          The Wilson score interval of the proportion positive/parent (Wilson 1927), which stays inside 0 to
          100% for rare events and for none at all.
        </p>
      </section>
    </Modal>
  );
}
