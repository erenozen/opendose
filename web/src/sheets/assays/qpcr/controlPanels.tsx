// qPCR no-template (NTC) and no-RT controls: the chips and the samples an
// amplified control may affect (engine assay_qpcr.control_checks), on the
// results sheet and in the wizard's QC step, plus the step's thresholds.
import { useEffect, useState } from "react";
import { NumberField } from "../../../components/ui";
import { runEngine } from "../../../lib/engine";
import type { DataTableModel } from "../../../project/types";
import { num } from "../kit/format";
import { Chip } from "../kit/ui";
import { controlChip, CONTROLS_SOURCE } from "./controls";
import { runQpcr, type QpcrOptions, type QpcrResult } from "./model";
import "./qpcr.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function ControlChecks({ c }: { c: any }) {
  if (!c) return null;
  const flags: any[] = c.flags ?? [];
  const clean: any[] = c.clean ?? [];
  const delta = c.min_delta;
  return (
    <div className="qpcr-controls">
      <div className="assay-chips">
        {flags.map((f) => <Chip key={`${f.control}-${f.target}`} tone="warn">{controlChip(f)}</Chip>)}
        {clean.map((f) => (
          <Chip key={`${f.control}-${f.target}`} tone="pass">
            {f.kind === "ntc" ? "NTC" : "No-RT control"} clean for {f.target}
          </Chip>
        ))}
      </div>
      {flags.map((f) => (
        <div key={`${f.control}-${f.target}`} className="results-scroll">
          <table className="results-table qpcr-control-samples">
            <caption>{f.target} samples against {controlChip(f)}</caption>
            <thead><tr><th scope="col">Sample</th><th scope="col">Group</th><th scope="col">Mean Cq</th>
              <th scope="col">Cycles to the control</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {(f.samples ?? []).map((s: any) => (
                <tr key={s.sample}><th scope="row">{s.sample}</th><td>{s.group ?? ""}</td><td>{num(s.mean_cq)}</td>
                  <td>{num(s.delta)}</td>
                  <td>{s.affected ? <Chip tone="warn">within {delta} cycles</Chip> : <Chip tone="pass">clear</Chip>}</td></tr>
              ))}
              {!(f.samples ?? []).length && (
                <tr><td colSpan={5}>No samples of {f.target} on this plate.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      <p className="assay-cite">
        {CONTROLS_SOURCE} A control well with a Cq{c.max_cq != null ? ` below ${c.max_cq}` : ""} has amplified;
        a sample less than {delta} cycles before it is affected (at 100% efficiency the contamination is then
        more than 2^−{delta} of its template). Control wells are left out of the fold changes.
      </p>
    </div>
  );
}

/** The QC step's control thresholds and the checks with the draft settings. */
export function ControlStep({ table, o, set, controls }: {
  table: DataTableModel; o: QpcrOptions; set: (p: Partial<QpcrOptions>) => void; controls: number;
}) {
  return (
    <>
      <h4>No-template and no-RT controls</h4>
      <div className="wizard-row">
        <NumberField label="Count control amplification below Cq" min={0} fieldClassName="field-num"
          description="Blank: any Cq counts." defaultValue={o.controlMaxCq}
          onValueChange={(v) => set({ controlMaxCq: v.trim() })} />
        <NumberField label="Sample affected within" unit="cycles" min={0} fieldClassName="field-num"
          defaultValue={String(o.controlMinDelta)}
          onValueChange={(v) => {
            const x = Number(v.replace(",", "."));
            if (v.trim() && Number.isFinite(x) && x >= 0) set({ controlMinDelta: x });
          }} />
      </div>
      {controls
        ? <ControlPreview table={table} options={o} />
        : <p className="hint-block">
          No control wells found. Name them NTC (or “no template”), and no-RT wells after their sample
          (“CON-1 no-RT”), to check them here. {CONTROLS_SOURCE}
        </p>}
    </>
  );
}

function ControlPreview({ table, options }: { table: DataTableModel; options: QpcrOptions }) {
  const [res, setRes] = useState<QpcrResult | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const r = await runEngine((engine) => runQpcr((p) => engine.analyze(p), table, options), { priority: "user" })
        .catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      if (live) setRes(r);
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [table, options]);
  if (!res) return <p className="hint-block">Checking the controls…</p>;
  if (res.error) return <div className="results-error">{res.error}</div>;
  return <ControlChecks c={res.controls} />;
}
