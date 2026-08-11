import { useState } from "react";
import { getEngine } from "../lib/engine";
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
export function expandWells(spec: string): string[] {
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
export function expandRows(spec: string): string[] {
  const m = spec.trim().match(/^([A-Pa-p])\s*[-:]\s*([A-Pa-p])$/);
  if (!m) return spec.split(/[,;\s]+/).filter(Boolean).map((s) => s.toUpperCase());
  const a = m[1].toUpperCase().charCodeAt(0);
  const b = m[2].toUpperCase().charCodeAt(0);
  return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) =>
    String.fromCharCode(Math.min(a, b) + i),
  );
}

export default function PlateImportPanel({ onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [rowsSpec, setRowsSpec] = useState("B-G");
  const [firstCol, setFirstCol] = useState("2");
  const [controlCol, setControlCol] = useState("2");
  const [dosesSpec, setDosesSpec] = useState("5, 3, 2, 1, 0.7, 0.5, 0.3, 0.1, 0.05");
  const [blankSpec, setBlankSpec] = useState("H3-H5");
  const [groupNames, setGroupNames] = useState("");
  const [output, setOutput] = useState<"viability" | "inhibition">("viability");
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const runImport = async () => {
    setError("");
    setBusy(true);
    try {
      const rows = expandRows(rowsSpec);
      const doses = dosesSpec.split(/[,;\s]+/).filter(Boolean).map(Number);
      if (doses.some((d) => !(d > 0))) {
        throw new Error("doses must be positive numbers (control column is separate)");
      }
      const names = groupNames.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      const nGroups = Math.max(names.length, 1);
      if (rows.length % nGroups !== 0) {
        throw new Error(
          `${rows.length} rows cannot split evenly into ${nGroups} groups`,
        );
      }
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
      } else if (pasted.trim()) {
        data.text = pasted;
      } else {
        throw new Error("choose an .xlsx file or paste the plate grid");
      }

      const engine = await getEngine();
      const res = engine.analyze({
        analysis: "plate_quantify",
        data,
        options: {
          blank_wells: blankSpec.trim() ? expandWells(blankSpec) : [],
          groups,
          columns: [{ col: control, dose: 0 }, ...doseCols],
          control_dose: 0,
          output,
        },
      }) as {
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="controls plate-import">
      <button className="section-toggle" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} Import plate (SRB / MTT / viability)
      </button>
      {open && (
        <div className="plate-form">
          <label className="file-row">
            Plate file (.xlsx)
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            …or paste the grid (rows A–H incl. labels)
            <textarea
              rows={3}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"\t1\t2\t3…\nA\t0.064\t0.043…"}
            />
          </label>
          <div className="plate-grid-opts">
            <label>Sample rows
              <input value={rowsSpec} onChange={(e) => setRowsSpec(e.target.value)} />
            </label>
            <label>First sample column
              <input value={firstCol} onChange={(e) => setFirstCol(e.target.value)} />
            </label>
            <label>Control (0-dose) column
              <input value={controlCol} onChange={(e) => setControlCol(e.target.value)} />
            </label>
            <label>Blank wells
              <input value={blankSpec} onChange={(e) => setBlankSpec(e.target.value)} />
            </label>
          </div>
          <label>
            Doses for the remaining columns, in order
            <input value={dosesSpec} onChange={(e) => setDosesSpec(e.target.value)} />
          </label>
          <label>
            Group names (splits sample rows evenly; blank = one group)
            <input
              value={groupNames}
              placeholder="e.g. Control, Resistant"
              onChange={(e) => setGroupNames(e.target.value)}
            />
          </label>
          <label>
            Compute
            <select value={output}
              onChange={(e) => setOutput(e.target.value as "viability" | "inhibition")}>
              <option value="viability">% viability (vs 0-dose control)</option>
              <option value="inhibition">% inhibition</option>
            </select>
          </label>
          <button className="primary" disabled={busy} onClick={runImport}>
            {busy ? "Importing…" : "Import → data table"}
          </button>
          {error && <div className="results-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
