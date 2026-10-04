import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import manifest from "./validation.json";

interface Check {
  group: string;
  analysis: string;
  quantity: string;
  ours: string;
  reference: string;
  tolerance: string;
  source: string;
  file: string;
  note?: string;
  n_values?: number;
}

const data = manifest as { compiled: string; groups: Record<string, string>; checks: Check[] };

/** Group names as shown on the page. */
const GROUP_TITLES: Record<string, string> = {
  "Prism screenshot": "GraphPad Prism results for the same data",
  "NIST StRD": "NIST Statistical Reference Datasets",
  "Statistics guide example": "Worked examples from the GraphPad guides",
  "Published table": "Published critical-value tables",
  "Published example": "Worked examples from textbooks and papers",
  statsmodels: "statsmodels, side by side",
  pingouin: "pingouin, side by side",
  R: "R package documentation",
  SciPy: "Independent SciPy routines, side by side",
  Other: "Other references",
};

/**
 * "How OpenDose is validated": every pinned cross-check in the test suite
 * (src/share/validation.json, compiled from engine/tests and
 * docs/prism-validation.md), grouped by kind of reference, with the
 * value OpenDose is held to, the reference value, the tolerance and the
 * source.
 */
export default function ValidationPage({ onClose }: { onClose: () => void }) {
  const groups = useMemo(() => [...new Set(data.checks.map((c) => c.group))], []);
  const [only, setOnly] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = data.checks.filter((c) => (!only || c.group === only)
    && (!q || `${c.analysis} ${c.quantity} ${c.source}`.toLowerCase().includes(q)));
  const values = data.checks.reduce((n, c) => n + (c.n_values ?? 1), 0);

  return (
    <Modal title="How OpenDose is validated" className="validation-page" onClose={onClose}
      actions={<button type="button" className="btn-primary" onClick={onClose}>Close</button>}>
      <p className="validation-intro">
        Every analysis runs in the same Python engine (NumPy and SciPy) that
        the project&apos;s test suite checks on every change. The checks below
        are pinned: each holds an OpenDose result to a reference computed
        independently, namely numbers read off GraphPad Prism results sheets for the
        same data, certified NIST values, worked examples from statistics
        guides and textbooks, published critical-value tables, and results
        from statsmodels, pingouin and SciPy computed side by side. A change
        that moves any number outside its stated tolerance fails the build.
        The tests are open source (engine/tests in the repository), so anyone
        can rerun them; the file and line of each assertion are listed.
      </p>
      <p className="validation-intro">
        {data.checks.length} checks covering about {values} pinned values, compiled{" "}
        {data.compiled}. Where a library is compared at test time, the
        OpenDose column reads &ldquo;computed at test time&rdquo;: both sides
        are computed on every run and must agree within the tolerance.
      </p>
      <div className="field-row">
        <label className="field">
          <span>Find an analysis</span>
          <input type="search" value={query} placeholder="e.g. nested, Dunnett, LogIC50"
            onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <ul className="validation-summary" aria-label="Filter by kind of reference">
        <li>
          <button type="button" aria-pressed={only === null} onClick={() => setOnly(null)}>
            All ({data.checks.length})
          </button>
        </li>
        {groups.map((g) => (
          <li key={g}>
            <button type="button" aria-pressed={only === g}
              onClick={() => setOnly(only === g ? null : g)}>
              {g} ({data.checks.filter((c) => c.group === g).length})
            </button>
          </li>
        ))}
      </ul>
      {groups.filter((g) => shown.some((c) => c.group === g)).map((g) => (
        <section key={g} className="validation-group" aria-labelledby={`val-${g}`}>
          <h3 id={`val-${g}`}>{GROUP_TITLES[g] ?? g}</h3>
          {data.groups[g] && <p>{data.groups[g]}</p>}
          <div className="validation-table-wrap">
            <table className="validation-table">
              <thead>
                <tr>
                  <th scope="col">Analysis</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">OpenDose</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Tolerance</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {shown.filter((c) => c.group === g).map((c, i) => (
                  <tr key={i}>
                    <td>{c.analysis}</td>
                    <td>{c.quantity}{c.n_values ? <span className="validation-note">{c.n_values} values</span> : null}</td>
                    <td className="num">{c.ours}</td>
                    <td className="num">{c.reference}</td>
                    <td>{c.tolerance || "exact"}</td>
                    <td className="src">
                      {c.source}
                      <code className="validation-note">{c.file}</code>
                      {c.note && <span className="validation-note">{c.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!shown.length && <p className="field-note">No check matches “{query}”.</p>}
    </Modal>
  );
}
