// Sphericity of each repeated term of a two-way repeated-measures ANOVA
// (engine repeated.sphericity): the Geisser-Greenhouse and Huynh-Feldt
// epsilons, the Huynh-Feldt corrected P and Mauchly's test. Mauchly's
// test is reported, never used to choose the correction (P-40).
import { formatSig } from "../../types";
import { tableP } from "../../report/pformat";
import { sphericityRowsOf } from "./sphericity";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function SphericityTable({ result, labels }: {
  result: any; labels?: Record<string, string>;
}) {
  const rows = sphericityRowsOf(result, labels);
  if (!rows.length) return null;
  return (
    <>
      <h4>Sphericity</h4>
      <div className="results-scroll">
        <table className="results-table">
          <thead>
            <tr><th>Repeated term</th><th>Geisser-Greenhouse ε</th><th>Huynh-Feldt ε</th>
              <th>P (Huynh-Feldt corrected)</th><th>Mauchly&apos;s W</th><th>P (Mauchly)</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                <td>{formatSig(r.gg)}</td>
                <td>{r.hf === null ? "undefined" : formatSig(r.hf)}</td>
                <td>{r.pHf === null ? "n/a" : tableP(r.pHf)}</td>
                <td>{r.mauchlyW === null ? r.mauchlyNote : formatSig(r.mauchlyW)}</td>
                <td>{r.mauchlyP === null ? "n/a" : tableP(r.mauchlyP)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="model-line">
        Mauchly&apos;s test is reported, not used to choose the correction: P is
        Geisser-Greenhouse corrected either way. Huynh-Feldt ε with Lecoutre&apos;s (1991)
        correction, as R car and afex.
      </p>
    </>
  );
}
