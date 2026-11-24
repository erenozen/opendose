// Results of the nonparametric two-way ANOVA by the aligned rank
// transform (art.ts): the ANOVA on the aligned ranks, the cell medians,
// the ART-C contrasts and when the log scale is the better route.
import { formatSig } from "../../types";
import { adjustedHeader, familyOf, hasUnadjusted } from "../../report/family";
import FamilyLine from "../common/FamilyLine";
import { fmtCI, fmtP, stars } from "./format";
import { ART_LOG_NOTE, ART_SOURCES, artContrastsTitle, artRows, LOG_ROUTE_SOURCE } from "./art";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** "Sources: A; B." inline, as the source lines of the column results. */
export function Sources({ list }: { list: { label: string; url: string }[] }) {
  return (
    <span className="source-line">Sources: {list.map((s, i) => (
      <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
    ))}.</span>
  );
}

function ArtContrasts({ block, factors }: { block: R; factors: [string, string] }) {
  const fam = familyOf(block);
  const unadj = hasUnadjusted(block.comparisons) && fam?.kind !== "unadjusted";
  return (
    <>
      <h4>{artContrastsTitle(block, factors)}</h4>
      <FamilyLine family={fam} />
      <div className="results-scroll">
        <table className="results-table comparisons-table art-contrasts">
          <thead>
            <tr>
              <th>Comparison</th><th>Difference of mean ranks</th><th>95% CI</th>
              <th>t (df)</th><th>{adjustedHeader(fam)}</th>{unadj && <th>Unadjusted P</th>}
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {(block.comparisons as R[]).map((c, i) => (
              <tr key={i}>
                <th>{c.pair}</th>
                <td>{formatSig(c.difference)}</td>
                <td>{c.ci ? fmtCI(c.ci) : "n/a (step-down test)"}</td>
                <td>{formatSig(c.t)} ({c.df})</td>
                <td data-p={c.p_adjusted}>{fmtP(c.p_adjusted)}</td>
                {unadj && <td>{fmtP(c.p_unadjusted)}</td>}
                <td>{stars(c.p_adjusted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ArtResults({ result, factors }: { result: R; factors: [string, string] }) {
  const rows = artRows(result, factors);
  const med: unknown = result.cell_medians;
  const rn: string[] = Array.isArray(result.row_names) ? result.row_names : [];
  const cn: string[] = Array.isArray(result.dataset_names) ? result.dataset_names : [];
  return (
    <div className="result-card art-results">
      <h3>Two-way ANOVA on aligned ranks (nonparametric)</h3>
      <p className="model-line">
        Aligned rank transform, {result.n} values; each effect tested on the ranks aligned for it
        (type III ANOVA of the ranks)
      </p>
      <div className="results-scroll">
        <table className="results-table art-anova">
          <thead>
            <tr><th>Source of variation</th><th>F (DFn, DFd)</th><th>P value</th><th>Summary</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th>{r.label}</th>
                <td>{r.F === null ? "n/a" : `F(${r.df}, ${r.dfRes}) = ${formatSig(r.F)}`}</td>
                <td data-p={r.p ?? undefined}>{fmtP(r.p)}</td>
                <td>{stars(r.p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.note && <p className="hint-block">{String(result.note)}</p>}
      {Array.isArray(med) && rn.length > 0 && (
        <div className="results-scroll">
          <table className="results-table">
            <thead><tr><th>Cell medians</th>{cn.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {(med as unknown[][]).map((row, i) => (
                <tr key={i}><th>{rn[i]}</th>{row.map((v, j) => <td key={j}>{typeof v === "number" ? formatSig(v) : "n/a"}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.art_contrasts && <ArtContrasts block={result.art_contrasts} factors={factors} />}
      <p className="model-line art-note">
        Each value was aligned for one effect (the other effects removed), the aligned values were
        ranked, and a factorial ANOVA of the ranks gave that effect&apos;s F and P.{" "}
        <Sources list={ART_SOURCES} />
      </p>
      <p className="hint-block art-log-note">
        {ART_LOG_NOTE} <Sources list={[LOG_ROUTE_SOURCE]} />
      </p>
    </div>
  );
}
