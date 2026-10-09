// The Interaction block of an ordinary two-way ANOVA (need
// `interaction-question`): first when the analysis was opened to ask
// whether the treatment effect differs between groups, otherwise folded
// under the ANOVA. The interaction P, the difference of the two effects
// with its CI (engine interaction_contrasts), the simple effects, the
// interaction plot and why two separate tests cannot answer the question.
import { lazy, Suspense } from "react";
import { SRC } from "../../guide/sources";
import LearnMore from "../../guide/LearnMore";
import type { DataTableModel } from "../../project/types";
import { formatSig } from "../../types";
import { fmtCI, fmtP, pLabel } from "./format";
import {
  contrastReading, contrastSentence, interactionSummary, type SimpleEffect,
} from "./interactionSummary";

const InteractionPlot = lazy(() => import("./interactionPlot"));

function EffectsTable({ title, rows, ciLevel }: { title: string; rows: SimpleEffect[]; ciLevel: number }) {
  if (!rows.length) return null;
  return (
    <>
      <h4>{title}</h4>
      <div className="results-scroll">
        <table className="results-table" aria-label={title}>
          <thead>
            <tr><th scope="col">Within</th><th scope="col">Comparison</th><th scope="col">Difference</th>
              <th scope="col">{Math.round(ciLevel * 100)}% CI</th><th scope="col">P (unadjusted)</th></tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i}>
                <th scope="row">{e.within}</th><td>{e.pair}</td><td>{formatSig(e.difference)}</td>
                <td>{fmtCI(e.ci)}</td><td>{fmtP(e.p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Body({ result, table, factors }: {
  result: unknown; table: DataTableModel; factors: [string, string];
}) {
  const s = interactionSummary(result);
  if (!s) return null;
  const lead = s.contrasts.find((c) => c.isInteraction) ?? s.contrasts[0];
  const pct = `${Math.round(s.ciLevel * 100)}%`;
  return (
    <>
      {s.test && (
        <p className="summary-line interaction-test">
          <strong>Interaction ({factors[0]} × {factors[1]}):</strong>{" "}
          {s.test.F !== null ? `F(${s.test.dfn}, ${s.test.dfd}) = ${formatSig(s.test.F)}, ` : ""}
          {pLabel(s.test.p)}
        </p>
      )}
      {lead && (
        <p className="summary-line interaction-dod">
          <strong>Difference of differences:</strong> {contrastSentence(lead, s.ciLevel)}{" "}
          {contrastReading(lead, s.ciLevel)}
        </p>
      )}
      {s.withheld && !s.contrasts.length && (
        <p className="hint-block">{s.notes[0] ?? "The interaction contrasts could not be computed."}</p>
      )}
      {s.contrasts.length > 0 && (
        <div className="results-scroll">
          <table className="results-table interaction-table" aria-label="Interaction contrasts">
            <thead>
              <tr><th scope="col">Contrast (difference of differences)</th>
                <th scope="col">Effect in first column</th><th scope="col">Effect in second column</th>
                <th scope="col">Difference</th><th scope="col">{pct} CI</th><th scope="col">P</th></tr>
            </thead>
            <tbody>
              {s.contrasts.map((c, i) => (
                <tr key={i}>
                  <th scope="row">{c.label}</th>
                  <td>{c.cols[0]}: {formatSig(c.effect1)}</td>
                  <td>{c.cols[1]}: {formatSig(c.effect2)}</td>
                  <td>{formatSig(c.difference)}</td>
                  <td>{fmtCI(c.ci)}</td>
                  <td>{fmtP(c.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.contrasts.length > 1 && (
        <p className="hint-block">
          One contrast per pair of rows and pair of columns, each with its own P value (not
          adjusted: each is a separate question). Pick the one you planned.
        </p>
      )}
      <div className="interaction-warning" role="note" aria-label="Significant in one group, not in the other">
        <p>
          <strong>Significant in one group, not in the other, is not evidence of a difference
            between groups.</strong> Do not compare two separate t tests (one per group): a P below
          0.05 in one and above 0.05 in the other can come from two nearly equal effects. The
          difference of differences above, with its CI, is the comparison of the effects.
        </p>
        <p className="guide-chip-sources">
          {[SRC.gelmanStern2006, SRC.nieuwenhuis2011, SRC.gpTwoWayResults].map((src) => (
            <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="guide-source">
              {src.label}</a>
          ))}
          <LearnMore id="interaction" />
        </p>
      </div>
      <EffectsTable title={`Simple effects: ${factors[0]} within each ${factors[1]}`}
        rows={s.rowEffects} ciLevel={s.ciLevel} />
      <EffectsTable title={`Simple effects: ${factors[1]} within each ${factors[0]}`}
        rows={s.colEffects} ciLevel={s.ciLevel} />
      {(s.rowEffects.length > 0 || s.colEffects.length > 0) && (
        <p className="hint-block">
          Simple effects use the pooled residual of the two-way ANOVA; their P values are not
          adjusted (the corrected comparisons are in the multiple comparisons above). Read them
          after the interaction, as description.
        </p>
      )}
      {s.notes.filter((n) => !/^2 x 2 design/.test(n)).map((n) => (
        <p key={n} className="hint-block">{n}</p>
      ))}
      <Suspense fallback={null}>
        <InteractionPlot table={table} rowFactor={factors[0]} />
      </Suspense>
    </>
  );
}

/** The block; `first` = opened to ask the interaction question. */
export default function InteractionBlock({ result, table, factors, first }: {
  result: unknown; table: DataTableModel; factors: [string, string]; first: boolean;
}) {
  if (!interactionSummary(result)) return null;
  if (first) {
    return (
      <section className="result-card interaction-block" aria-labelledby="interaction-h">
        <h3 id="interaction-h">Interaction: does the effect differ between groups?</h3>
        <Body result={result} table={table} factors={factors} />
      </section>
    );
  }
  return (
    <details className="result-card interaction-block">
      <summary>Interaction: difference of differences, simple effects and interaction plot</summary>
      <Body result={result} table={table} factors={factors} />
    </details>
  );
}
