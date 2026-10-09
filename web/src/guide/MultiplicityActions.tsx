// The two one-click alternatives under the "k t tests on this table" chip
// (guide/multiplicity.ts): add (or open) the one-way ANOVA with Dunnett's
// test against the common control, or adjust the t tests' P values
// together with the engine's Holm-Šídák step-down (fdr_adjust).
import { useState } from "react";
import { resolveOptions } from "../app/analysis";
import { useProject } from "../app/context";
import { renameForOptions } from "../app/resultsName";
import { runEngine } from "../lib/engine";
import { newId } from "../project/ids";
import type { DataSheet, ResultsSheet } from "../project/types";
import { tableP } from "../report/pformat";
import { analysisDef } from "../sheets/registry";
import { addConfiguredAnalysis } from "./actions";
import { anovaOptionsFor, existingAnova, type MultiplicityFacts } from "./multiplicity";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface Adjusted { label: string; p: number; adjusted: number | null }

export default function MultiplicityActions({ facts }: { facts: MultiplicityFacts }) {
  const { project, apply, select, readOnly } = useProject();
  const [holm, setHolm] = useState<Adjusted[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const data = project.sheets.find((s) => s.id === facts.dataId) as DataSheet | undefined;
  const ctl = facts.control !== null ? facts.names[facts.control] : null;
  const have = existingAnova(project, facts);

  const addAnova = () => {
    if (have) { select(have.id); return; }
    if (!data) return;
    let goTo: string | null = null;
    apply((p) => {
      const r = addConfiguredAnalysis(p, facts.dataId, { tableType: data.table.type,
        analysisId: "column", options: anovaOptionsFor(facts), layout: "" }, newId);
      goTo = r.resultsId;
      // Named after the test it runs ("One-way ANOVA of …").
      return r.resultsId ? renameForOptions(r.project, r.resultsId, { analysis: "column_statistics" },
        analysisDef) : r.project;
    });
    if (goTo) select(goTo);
  };

  const adjust = async () => {
    if (!data) return;
    setBusy(true); setErr(null);
    try {
      // One P per distinct pair: the first sheet testing it.
      const seen = new Set<string>();
      const runs = facts.runs.filter((t) => {
        const k = `${Math.min(t.a, t.b)}:${Math.max(t.a, t.b)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const def = analysisDef(data.table.type, "column");
      if (!def) throw new Error("no column analysis");
      const rows = await runEngine((engine) => runs.map((t) => {
        const s = project.sheets.find((x) => x.id === t.sheetId) as ResultsSheet;
        const o = resolveOptions(def, s.options, data.table, project.prefs);
        const r = def.run(engine, data.table, o) as R;
        const p = typeof r?.p_two_tailed === "number" ? r.p_two_tailed : null;
        return { label: `${facts.names[t.a] ?? t.a} vs. ${facts.names[t.b] ?? t.b}`, p };
      }), { priority: "user" });
      const ok = rows.filter((x): x is { label: string; p: number } => x.p !== null);
      if (!ok.length) throw new Error("no P values to adjust");
      const res = await runEngine((engine) => engine.analyze({ analysis: "fdr_adjust",
        data: { p_values: ok.map((x) => x.p), labels: ok.map((x) => x.label) },
        options: { method: "holm_sidak", alpha: 0.05 } }), { priority: "user" }) as R;
      if (res?.error) throw new Error(String(res.error));
      const adj: (number | null)[] = Array.isArray(res.adjusted) ? res.adjusted : [];
      setHolm(ok.map((x, i) => ({ ...x, adjusted: typeof adj[i] === "number" ? adj[i] : null })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="guide-chip-action multiplicity-actions">
      <p>
        <button type="button" disabled={readOnly && !have} onClick={addAnova}>
          {have ? `Open “${have.name}”`
            : ctl ? `One-way ANOVA with Dunnett vs ${ctl}` : "One-way ANOVA with Tukey's test"}
        </button>{" "}
        <button type="button" disabled={busy} onClick={() => void adjust()}>
          {busy ? "Adjusting…" : `Adjust these ${facts.k} P values (Holm-Šídák)`}</button>
      </p>
      {err && <p className="multiplicity-error" role="alert">Could not adjust: {err}</p>}
      {holm && (
        <table className="guide-holm" aria-label="P values adjusted by Holm-Šídák">
          <thead><tr><th scope="col">Comparison</th><th scope="col">P (t test)</th>
            <th scope="col">Adjusted P (Holm-Šídák)</th></tr></thead>
          <tbody>
            {holm.map((h) => (
              <tr key={h.label}>
                <th scope="row">{h.label}</th>
                <td>{tableP(h.p)}</td>
                <td>{tableP(h.adjusted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
