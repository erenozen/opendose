// The "Effect size" block of a results sheet: for every comparison the
// engine reports, the project's default measure (Preferences ->
// Reporting) with its value, CI and interpretation, and the other
// measures one click away. Interpretation labels carry their scale and
// source (tooltip and the notes under the table).
import { formatSig } from "../types";
import { effectGroups, type EffectGroup, type EffectRow } from "./effects";
import { useReportPrefs } from "./useReport";
import "./report.css";

const pct = (l: number) => `${Number((l * 100).toPrecision(4))}%`;

function ciText(r: EffectRow): string {
  return r.ci ? `${formatSig(r.ci[0])} to ${formatSig(r.ci[1])}` : "n/a";
}

function tip(r: EffectRow): string {
  const it = r.interpretation;
  if (!it) return "";
  const th = it.thresholds ? ` (thresholds ${it.thresholds.join(", ")})` : "";
  return `${it.label} on the ${it.scale} scale${th}. ${it.source}`;
}

function Rows({ rows }: { rows: EffectRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.id} className={r.preferred ? "es-preferred" : undefined}>
          <th scope="row">
            {r.measure}
            {r.preferred && <span className="es-default" title="Default measure (Preferences, Reporting)">default</span>}
          </th>
          <td>{formatSig(r.value)}</td>
          <td>{ciText(r)}</td>
          <td>{r.interpretation
            ? <span className="es-label" title={tip(r)}>{r.interpretation.label}</span> : ""}</td>
        </tr>
      ))}
    </>
  );
}

function Group({ g }: { g: EffectGroup }) {
  const pref = g.rows.filter((r) => r.preferred);
  const others = g.rows.filter((r) => !r.preferred);
  const level = g.rows[0]?.ciLevel ?? 0.95;
  return (
    <>
      {g.title && <h4>{g.title}</h4>}
      <table className="results-table effect-table">
        <thead>
          <tr><th>Effect size</th><th>Value</th><th>{pct(level)} CI</th><th>Interpretation</th></tr>
        </thead>
        <tbody><Rows rows={pref} /></tbody>
      </table>
      {others.length > 0 && (
        <details>
          <summary>Other measures ({others.length})</summary>
          <table className="results-table effect-table">
            <tbody><Rows rows={others} /></tbody>
          </table>
        </details>
      )}
    </>
  );
}

/** Effect sizes of a result; nothing when the result has none. */
export default function EffectSizeCard({ result }: { result: unknown }) {
  const prefs = useReportPrefs();
  const groups = effectGroups(result, prefs);
  if (!groups.length) return null;
  const rows = groups.flatMap((g) => g.rows);
  const sources = [...new Set(rows.map((r) => r.interpretation?.source).filter(Boolean))] as string[];
  const methods = [...new Set(rows.filter((r) => r.ci && r.ciMethod).map((r) => `${r.measure}: ${r.ciMethod}`))];
  return (
    <div className="result-card effect-card">
      <h3>Effect size</h3>
      {groups.map((g, i) => <Group key={`${g.title ?? ""}${i}`} g={g} />)}
      <ul className="es-notes">
        {methods.slice(0, 4).map((m) => <li key={m}>CI: {m}.</li>)}
        {sources.map((s) => <li key={s}>Interpretation: {s}. Labels describe size only, not importance.</li>)}
      </ul>
    </div>
  );
}
