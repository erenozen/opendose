// "Compare two event rates" (FEATURE-PLAN P-47): a small calculator in a
// dialog, opened from the Analyze menu, File > Tools and the command
// palette. Counts with their exposures in, each rate with its exact CI,
// the rate ratio with its exact conditional CI and the P values out;
// recomputed in the engine worker as the numbers change (rates.ts).
import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import { Button, Field, Input, NumberField, NumText } from "../components/ui";
import { analyzeAsync, isCancelled } from "../lib/engine";
import {
  DEFAULT_RATE_FORM, RATE_SOURCES, eventsProblem, exposureProblem, ratePayload, rateRows,
  rateSentence, type RateForm,
} from "./rates";
import "./rates.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Group({ n, form, set }: { n: 1 | 2; form: RateForm; set: (p: Partial<RateForm>) => void }) {
  const name = n === 1 ? "name1" : "name2";
  const events = n === 1 ? "events1" : "events2";
  const exposure = n === 1 ? "exposure1" : "exposure2";
  return (
    <fieldset className="rates-group">
      <legend>Group {n}</legend>
      <Field label={`Name of group ${n}`}>
        <Input value={form[name]} autoComplete="off" spellCheck={false}
          onChange={(e) => set({ [name]: e.target.value })} />
      </Field>
      <NumberField label={`Events in group ${n}`} min={0} integer
        value={form[events]} error={eventsProblem(form[events])}
        onValueChange={(v) => set({ [events]: v })} />
      <NumberField label={`Exposure of group ${n}`} min={0}
        description={form.unit.trim() ? `In ${form.unit.trim()}` : undefined}
        value={form[exposure]} error={exposureProblem(form[exposure])}
        onValueChange={(v) => set({ [exposure]: v })} />
    </fieldset>
  );
}

export default function RatesDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<RateForm>(DEFAULT_RATE_FORM);
  const [result, setResult] = useState<any>(null);
  const set = (p: Partial<RateForm>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    const payload = ratePayload(form);
    if (!payload) { setResult(null); return; }
    let live = true;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await analyzeAsync(payload, { signal: ctl.signal, priority: "user" });
        if (live) setResult(r);
      } catch (e) {
        if (live && !isCancelled(e)) setResult({ error: String(e instanceof Error ? e.message : e) });
      }
    }, 150);
    return () => { live = false; ctl.abort(); clearTimeout(t); };
  }, [form]);

  const rows = rateRows(result, form.unit);
  const sentence = rateSentence(result);
  return (
    <Modal title="Compare two event rates" className="rates-dialog" onClose={onClose}
      actions={<Button onClick={onClose}>Done</Button>}>
      <p className="hint-block">
        Counts of events observed over different exposures (time, area, cells): each rate with its
        exact CI, and the rate ratio with the exact conditional test.
      </p>
      <Field label="Exposure unit" description="For example hours, mm² or 10⁶ cells (optional)">
        <Input value={form.unit} autoComplete="off" onChange={(e) => set({ unit: e.target.value })} />
      </Field>
      <div className="rates-groups">
        <Group n={1} form={form} set={set} />
        <Group n={2} form={form} set={set} />
      </div>
      <div className="rates-result">
        {result?.error ? (
          <p className="results-error">Could not compare the rates: {String(result.error).replace(/\.$/, "")}.</p>
        ) : rows.length > 0 ? (
          <>
            <table className="results-table goodness rates-table">
              <tbody>
                {rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.value}</td></tr>)}
              </tbody>
            </table>
            {sentence && <p className="model-line"><NumText text={sentence} /></p>}
            <p className="model-line source-line">
              As R&apos;s poisson.test. Sources: {RATE_SOURCES.map((s, i) => (
                <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
              ))}.
            </p>
          </>
        ) : (
          <p className="hint-block">Enter the events and the exposure of both groups to see the comparison.</p>
        )}
      </div>
    </Modal>
  );
}
