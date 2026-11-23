import { useId, useState } from "react";
import { Button, Field, FileButton, Input } from "./ui";
import { analyzeAsync } from "../lib/engine";
import type { DatasetState } from "../types";

interface Props {
  onImport: (r: {
    x: string[];
    datasets: DatasetState[];
    output: "viability" | "inhibition";
    blank: number | null;
  }) => void;
}

// "H3-H5" | "H3:H5" | "H3,H4,H5" -> ["H3","H4","H5"] (ranges within a row)
function expandWells(spec: string): string[] {
  const out: string[] = [];
  for (const part of spec.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^([A-Pa-p])(\d{1,2})[-:]([A-Pa-p])?(\d{1,2})$/);
    if (m && (!m[3] || m[3].toUpperCase() === m[1].toUpperCase())) {
      const row = m[1].toUpperCase();
      const from = parseInt(m[2], 10);
      const to = parseInt(m[4], 10);
      for (let c = Math.min(from, to); c <= Math.max(from, to); c++) {
        out.push(`${row}${c}`);
      }
    } else {
      out.push(part.toUpperCase());
    }
  }
  return out;
}

// "B-G" -> ["B","C","D","E","F","G"]
function expandRows(spec: string): string[] {
  const m = spec.trim().match(/^([A-Pa-p])\s*[-:]\s*([A-Pa-p])$/);
  if (!m) return spec.split(/[,;\s]+/).filter(Boolean).map((s) => s.toUpperCase());
  const a = m[1].toUpperCase().charCodeAt(0);
  const b = m[2].toUpperCase().charCodeAt(0);
  return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) =>
    String.fromCharCode(Math.min(a, b) + i),
  );
}

const dosesOf = (spec: string) => spec.split(/[,;\s]+/).filter(Boolean).map(Number);
const namesOf = (spec: string) => spec.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

export default function PlateImportPanel({ onImport }: Props) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const [rowsSpec, setRowsSpec] = useState("B-G");
  const [firstCol, setFirstCol] = useState("2");
  const [controlCol, setControlCol] = useState("2");
  const [dosesSpec, setDosesSpec] = useState("5, 3, 2, 1, 0.7, 0.5, 0.3, 0.1, 0.05");
  const [blankSpec, setBlankSpec] = useState("H3-H5");
  const [groupNames, setGroupNames] = useState("");
  const [output, setOutput] = useState<"viability" | "inhibition">("viability");
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // A problem with the whole import (no plate given, or the engine could
  // not read it); field problems show under their field.
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // Live problems, shown by Field on blur or on a submit attempt (forms.md).
  const rows = expandRows(rowsSpec);
  const doses = dosesOf(dosesSpec);
  const dosesProblem = !doses.length || doses.some((d) => !(d > 0))
    ? "Enter positive doses, separated by commas (the control column is separate)" : null;
  const nGroups = Math.max(namesOf(groupNames).length, 1);
  const groupsProblem = rows.length % nGroups !== 0
    ? `Name a number of groups that divides the ${rows.length} sample rows evenly` : null;

  const runImport = async () => {
    setError("");
    setAttempts((n) => n + 1);
    if (dosesProblem || groupsProblem) return;
    if (!file && !pasted.trim()) {
      setError("Choose an .xlsx file or paste the plate grid first.");
      return;
    }
    setBusy(true);
    try {
      const names = namesOf(groupNames);
      const perGroup = rows.length / nGroups;
      const groups = Array.from({ length: nGroups }, (_, g) => ({
        name: names[g] ?? "Sample",
        rows: rows.slice(g * perGroup, (g + 1) * perGroup),
      }));

      const control = parseInt(controlCol, 10);
      const first = parseInt(firstCol, 10);
      const doseCols = [];
      let col = first;
      for (const dose of doses) {
        if (col === control) col++; // skip the control column position
        doseCols.push({ col, dose });
        col++;
      }

      const data: Record<string, unknown> = {};
      if (file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        }
        data.xlsx_b64 = btoa(bin);
      } else {
        data.text = pasted;
      }

      const res = await analyzeAsync({
        analysis: "plate_quantify",
        data,
        options: {
          blank_wells: blankSpec.trim() ? expandWells(blankSpec) : [],
          groups,
          columns: [{ col: control, dose: 0 }, ...doseCols],
          control_dose: 0,
          output,
        },
      }, { priority: "user" }) as {
        error?: string;
        blank: number | null;
        x: number[];
        datasets: { name: string; ys: (number | null)[][] }[];
      };
      if (res.error) throw new Error(res.error);

      onImport({
        x: res.x.map(String),
        datasets: res.datasets.map((d) => ({
          name: d.name,
          rows: d.ys.map((row) => row.map((v) => (v === null ? "" : String(v)))),
        })),
        output,
        blank: res.blank,
      });
    } catch (e) {
      const why = (e instanceof Error ? e.message : String(e)).replace(/\.$/, "");
      setError(`Could not read the plate${file ? ` “${file.name}”` : ""}: ${why}. Check the rows, `
        + "columns and blank wells, then import again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="controls plate-import">
      <button type="button" className="plate-toggle" aria-expanded={open} aria-controls={formId}
        onClick={() => setOpen(!open)} data-still>
        <svg className="plate-chevron" width={12} height={12} viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true">
          <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
        </svg>
        Import plate (SRB / MTT / viability)
      </button>
      {open && (
        <form id={formId} className="plate-form" noValidate
          onSubmit={(e) => { e.preventDefault(); if (!busy) void runImport(); }}>
          <div className="plate-file">
            <FileButton accept=".xlsx" inputLabel="Plate file (.xlsx)" onFile={setFile}>
              Choose a plate file…</FileButton>
            <span className="plate-file-name">{file ? file.name : "No file chosen (.xlsx)"}</span>
          </div>
          <Field label="…or paste the grid (rows A–H with their labels)" id={`${formId}-paste`}>
            <textarea id={`${formId}-paste`} rows={3} value={pasted} spellCheck={false}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"\t1\t2\t3…\nA\t0.064\t0.043…"} />
          </Field>
          <div className="plate-grid-opts">
            <Field label="Sample rows">
              <Input value={rowsSpec} autoComplete="off" spellCheck={false}
                onChange={(e) => setRowsSpec(e.target.value)} />
            </Field>
            <Field label="First sample column">
              <Input value={firstCol} inputMode="numeric" autoComplete="off"
                onChange={(e) => setFirstCol(e.target.value)} />
            </Field>
            <Field label="Control (0-dose) column">
              <Input value={controlCol} inputMode="numeric" autoComplete="off"
                onChange={(e) => setControlCol(e.target.value)} />
            </Field>
            <Field label="Blank wells">
              <Input value={blankSpec} autoComplete="off" spellCheck={false}
                onChange={(e) => setBlankSpec(e.target.value)} />
            </Field>
          </div>
          <Field label="Doses for the remaining columns, in order" error={dosesProblem}
            submitCount={attempts}>
            <Input value={dosesSpec} inputMode="decimal" autoComplete="off" spellCheck={false}
              onChange={(e) => setDosesSpec(e.target.value)} />
          </Field>
          <Field label="Group names" description="Splits the sample rows evenly; blank is one group."
            error={groupsProblem} submitCount={attempts}>
            <Input value={groupNames} placeholder="e.g. Control, Resistant" autoComplete="off"
              onChange={(e) => setGroupNames(e.target.value)} />
          </Field>
          <Field label="Compute" id={`${formId}-output`}>
            <select id={`${formId}-output`} value={output}
              onChange={(e) => setOutput(e.target.value as "viability" | "inhibition")}>
              <option value="viability">% viability (vs 0-dose control)</option>
              <option value="inhibition">% inhibition</option>
            </select>
          </Field>
          <div className="plate-actions">
            <Button type="submit" variant="primary" busy={busy}
              busyLabel="Importing…">Import into the table</Button>
            {/* Always mounted, so the message is announced when it appears. */}
            <p className="import-error" role="alert">{error}</p>
          </div>
          <p className="hint-block">
            This is the quick path for one SRB / MTT plate. For a drawn plate map, Z′ and CV
            QC, 384 wells or several plates, use New data table › Start from an assay › Plate
            reader; its “SRB / MTT viability” template is this layout.
          </p>
        </form>
      )}
    </div>
  );
}
