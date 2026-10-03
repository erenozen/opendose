import { useState } from "react";
import { allowsSummaryFormat, defaultInit, type NewTableInit } from "../project/table";
import {
  SUBCOLUMN_FORMAT_HAS_N, SUBCOLUMN_FORMAT_LABELS, SUBCOLUMN_FORMATS, type SubcolumnFormat,
  type TableType, type XFormat,
} from "../project/types";
import { REGISTRY, TABLE_ORDER } from "../sheets/registry";
import { openSimulate } from "../sheets/manipulate/simulateApi";
import Modal from "./Modal";

export interface NewTableRequest {
  type: TableType;
  name: string;
  init: NewTableInit;
  sample: boolean;
}

// Per type: what the three shape numbers mean (null = not asked).
const SHAPE_LABELS: Record<TableType, { datasets: string; subcolumns: string | null; rows: string }> = {
  xy: { datasets: "Y datasets", subcolumns: "Replicates per X", rows: "Rows (X values)" },
  column: { datasets: "Groups (columns)", subcolumns: null, rows: "Rows (values per group)" },
  grouped: { datasets: "Datasets (columns)", subcolumns: "Replicates", rows: "Rows (levels of the row factor)" },
  contingency: { datasets: "Outcomes (columns)", subcolumns: null, rows: "Groups (rows)" },
  survival: { datasets: "Groups", subcolumns: null, rows: "Rows (subjects)" },
  partsofwhole: { datasets: "Columns", subcolumns: null, rows: "Parts (rows)" },
  multivariable: { datasets: "Variables (columns)", subcolumns: null, rows: "Observations (rows)" },
  nested: { datasets: "Groups", subcolumns: "Subgroups per group", rows: "Replicates (rows)" },
};

const clampInt = (v: string, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export default function NewTableDialog({ defaultType, defaultName, onCancel, onCreate }: {
  defaultType: TableType;
  defaultName: string;
  onCancel: () => void;
  onCreate: (r: NewTableRequest) => void;
}) {
  const [type, setType] = useState<TableType>(defaultType);
  const [name, setName] = useState(defaultName);
  const [shape, setShape] = useState(() => {
    const d = defaultInit(defaultType);
    return { datasets: String(d.datasets), subcolumns: String(d.subcolumns), rows: String(d.rows) };
  });
  const [summary, setSummary] = useState<SubcolumnFormat>("replicates");
  const [xFormat, setXFormat] = useState<XFormat>("numbers");
  const [sample, setSample] = useState(false);

  const def = REGISTRY[type];
  const labels = SHAPE_LABELS[type];
  const allowsSummary = allowsSummaryFormat(type);

  const choose = (t: TableType) => {
    setType(t);
    const d = defaultInit(t);
    setShape({ datasets: String(d.datasets), subcolumns: String(d.subcolumns), rows: String(d.rows) });
    setSummary("replicates");
    setSample(false);
  };

  const submit = () => {
    const d = defaultInit(type);
    onCreate({
      type,
      name: name.trim() || defaultName,
      sample: sample && !!def.sampleTable,
      init: {
        datasets: clampInt(shape.datasets, 1, 52, d.datasets),
        subcolumns: clampInt(shape.subcolumns, 1, 24, d.subcolumns),
        rows: clampInt(shape.rows, 1, 5000, d.rows),
        subcolumnFormat: allowsSummary ? summary : "replicates",
        xFormat: type === "xy" ? xFormat : "numbers",
      },
    });
  };

  const num = (key: keyof typeof shape, label: string) => (
    <label className="field field-num">
      <span>{label}</span>
      <input inputMode="numeric" value={shape[key]} disabled={sample}
        onChange={(e) => setShape({ ...shape, [key]: e.target.value })} />
    </label>
  );

  return (
    <Modal title="New data table" className="modal-wide new-table-dialog"
      onClose={onCancel} onSubmit={submit}
      actions={
        <>
          <button type="button" className="simulate-entry"
            title="Make an XY, Column or Contingency table of simulated data"
            onClick={() => { onCancel(); openSimulate(); }}>Simulate data…</button>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary">Create table</button>
        </>
      }>
      <div className="new-table-grid">
        <fieldset className="type-list">
          <legend>Table format</legend>
          {TABLE_ORDER.map((t) => {
            const d = REGISTRY[t];
            return (
              <label key={t} className={`type-option${t === type ? " checked" : ""}`}>
                <input type="radio" name="table-type" value={t}
                  checked={t === type} onChange={() => choose(t)} />
                <span className="type-option-text">
                  <span className="type-option-name">
                    {d.label}
                    {d.status === "entry-only" && (
                      <span className="soon-badge">analyses next release</span>
                    )}
                  </span>
                  <span className="type-option-desc">{d.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="new-table-options">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
              aria-label="Table name" />
          </label>
          {def.sampleTable && (
            <fieldset className="field-radios">
              <legend>Start with</legend>
              <label><input type="radio" name="start" checked={!sample}
                onChange={() => setSample(false)} /> An empty table</label>
              <label><input type="radio" name="start" checked={sample}
                onChange={() => setSample(true)} /> Example data</label>
            </fieldset>
          )}
          <div className="shape-fields">
            {num("datasets", labels.datasets)}
            {labels.subcolumns && (!allowsSummary || summary === "replicates")
              && num("subcolumns", labels.subcolumns)}
            {num("rows", labels.rows)}
          </div>
          {allowsSummary && (
            <label className="field">
              <span>Y values entered as</span>
              <select value={summary} disabled={sample} aria-label="Y values entered as"
                onChange={(e) => {
                  const f = e.target.value as SubcolumnFormat;
                  setSummary(f);
                  // summaries of a column table: one row (one mean per group)
                  if (type === "column") {
                    setShape({ ...shape, rows: f === "replicates" ? String(defaultInit(type).rows) : "1" });
                  }
                }}>
                {SUBCOLUMN_FORMATS.map((f) => (
                  <option key={f} value={f}>{SUBCOLUMN_FORMAT_LABELS[f]}</option>
                ))}
              </select>
              {summary !== "replicates" && (
                <span className="field-note">
                  {SUBCOLUMN_FORMAT_HAS_N[summary]
                    ? "Mean and error computed elsewhere, with N: curve fits, t tests and ANOVA use them as they would the raw values."
                    : "Without N the errors are drawn as entered, but analyses can use only the means."}
                </span>
              )}
            </label>
          )}
          {type === "xy" && (
            <label className="field">
              <span>X values are</span>
              <select value={xFormat} disabled={sample}
                onChange={(e) => setXFormat(e.target.value as XFormat)}>
                <option value="numbers">Numbers</option>
                <option value="dates">Dates</option>
                <option value="elapsed">Elapsed times</option>
              </select>
              {xFormat !== "numbers" && (
                <span className="field-note">
                  {xFormat === "dates"
                    ? "Analyzed as days since the earliest date (other units under Format); graphs label X with dates."
                    : "Type h:mm:ss, h:mm or hours; analyzed in seconds (other units under Format)."}
                </span>
              )}
            </label>
          )}
          {def.status === "entry-only" && (
            <p className="field-note">
              The {def.label.toLowerCase()} table editor is ready; its
              analyses and graphs land in the next release.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
