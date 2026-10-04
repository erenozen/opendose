// Reporting details of a data table: the unit of n, independent
// experiments, exclusions and sample-size reasoning (meta.ts). They feed
// the figure legend, the statistical-analysis paragraph and the journal
// checklists.
import { useState } from "react";
import { useProject } from "../app/context";
import Modal from "../components/Modal";
import { updateSheet } from "../project/ops";
import type { DataSheet, Sheet } from "../project/types";
import { parseReportMeta } from "./meta";
import { replicateFacts } from "./replicates";
import { openAssignReplicates } from "./useReport";
import "./report.css";

export default function DetailsDialog({ dataId, onClose }: { dataId: string; onClose: () => void }) {
  const { project, apply, readOnly } = useProject();
  const data = project.sheets.find((s) => s.id === dataId) as DataSheet | undefined;
  const m = data?.report ?? {};
  const [unit, setUnit] = useState(m.unit ?? "");
  const [experiments, setExperiments] = useState(m.experiments ? String(m.experiments) : "");
  const [exclusions, setExclusions] = useState(m.exclusions ?? "");
  const [sampleSize, setSampleSize] = useState(m.sampleSize ?? "");
  if (!data) return null;
  // The table's replicate map supplies the unit and the experiments when
  // these fields are left blank (replicates.ts).
  const rep = replicateFacts(data.table);
  const canAssign = !readOnly && (data.table.type === "column" || data.table.type === "grouped");
  const save = () => {
    const report = parseReportMeta({
      unit, experiments: experiments.trim() ? Number(experiments) : undefined, exclusions, sampleSize,
    });
    apply((p) => updateSheet<Sheet>(p, dataId, (s) => {
      if (s.kind !== "data") return s;
      const { report: _old, ...rest } = s;
      void _old;
      return report ? { ...rest, report } : rest;
    }), `report:${dataId}`);
    onClose();
  };
  return (
    <Modal title={`Reporting details: ${data.name}`} onClose={onClose} onSubmit={readOnly ? undefined : save}
      actions={(
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={readOnly}>Save</button>
        </>
      )}>
      <div className="details-form">
        <p className="hint-block">
          Used in the figure legend (“n = 6 mice per group from 3 independent experiments”),
          the statistical-analysis paragraph and the journal checklists.
        </p>
        {rep && (
          <p className="hint-block details-from-map" role="note">
            From the table&apos;s replicate assignment: each value is one {rep.unit === "values"
              ? "value" : rep.unit.replace(/s$/, "")}, from {rep.experiments} independent
            experiments. Leave the two fields below blank to use these, or type to override.
          </p>
        )}
        <label>
          What one n is (plural noun)
          <input value={unit} onChange={(e) => setUnit(e.target.value)}
            placeholder={rep ? rep.unit : "mice, wells, patients, cells"} maxLength={60} />
        </label>
        <label>
          Independent experiments (biological replicates)
          <input type="number" min={1} step={1} value={experiments}
            onChange={(e) => setExperiments(e.target.value)}
            placeholder={rep ? String(rep.experiments) : "e.g. 3"} />
        </label>
        {canAssign && (
          <p className="details-assign">
            <button type="button" onClick={() => { onClose(); openAssignReplicates(data.id); }}>
              {rep ? "Change replicate assignment…" : "Assign replicates…"}</button>
          </p>
        )}
        <label>
          Exclusions and their criteria
          <textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)}
            placeholder="none; or which values were excluded and why (decided before unblinding)" maxLength={500} />
        </label>
        <label>
          How the sample size was decided
          <textarea value={sampleSize} onChange={(e) => setSampleSize(e.target.value)}
            placeholder="power analysis (see the power sheet), pilot data, resource equation…" maxLength={500} />
        </label>
      </div>
    </Modal>
  );
}
