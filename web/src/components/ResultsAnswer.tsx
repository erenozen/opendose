// The results headline (DECISIONS 3, "Answer first"): the pane at the top
// of the results column, above the graph and the full table. The sheet's
// name and where its numbers come from (DECISIONS 4, provenance), then
// for each data set (up to three, then "Show all") the key estimate in
// large figures with its CI line and its R² / n line (components/answer/
// keyFacts.ts), the plain-language reading (report/MeaningLine) at a 65ch
// measure, and the Checks row that discloses the guidance. Results no
// mapper knows show only the reading and the Checks row: the table below
// is their answer.
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../app/context";
import type { AnalysisStatus } from "../app/useAnalysisResult";
import type { DataSheet, ResultsSheet } from "../project/types";
import MeaningLine from "../report/MeaningLine";
import { currentChoice } from "../guide/choice";
import { ANALYSIS_COLUMN, ANALYSIS_NONLIN } from "../project/builtin";
import { concentrationUnit } from "../sheets/xy/rangeReport";
import { keyFacts, type KeyItem } from "./answer/keyFacts";
import AcrossExperiments from "./answer/AcrossExperiments";
import RankLine from "./answer/RankLine";
import { potencySummaries } from "../sheets/xy/experiments";
import ResultsChecks from "./ResultsChecks";
import { FirthAction } from "../guide/FirthAction";
import { offersFirth } from "../sheets/multivariable/glm";
import { useChecks } from "./useChecks";
import { Button, Num, NumText } from "./ui";
import "./answer/answer.css";

const SHOWN = 3;

/** The last height of each results sheet's answer pane with a result, so
 *  a result computed again (Run again, reopening the sheet) arrives into
 *  the same space. */
const heldHeight = new Map<string, number>();

/** The answer's shape, guessed before the result exists: the key figure
 *  (curve fits and t tests have a CI line, ANOVA does not; keyFacts.ts)
 *  and roughly how many characters each paragraph of "What this means"
 *  will have, [sentence, misreading, test, sources], or null for none.
 *  t test and ANOVA sentences name the groups (report/meaning.ts), so the
 *  guess counts the group names. Measured against the dose-response
 *  example and e2e-fixtures/stage/big-table.json. */
interface Shape { figure: "ci" | "plain" | null; reading: [number, number, number, number] | null }
function expectedShape(analysisId: string, options: unknown, table: DataSheet["table"]): Shape {
  if (analysisId === ANALYSIS_NONLIN) return { figure: "ci", reading: [285, 140, 70, 155] };
  if (analysisId === ANALYSIS_COLUMN) {
    const kind = (options as { analysis?: string } | null)?.analysis;
    if (kind !== "ttest" && kind !== "anova") return { figure: null, reading: null };
    const named = kind === "ttest" ? table.datasets.slice(0, 2) : table.datasets;
    const names = named.reduce((n, d) => n + d.name.length + 2, 0);
    return { figure: kind === "ttest" ? "ci" : "plain", reading: [200 + names, 165, 100, 280] };
  }
  // the wave 2 models lead with a ratio or difference and its CI line, and
  // have no plain-language reading (keyFacts.ts ancovaFacts, glmFacts)
  if (["mv_ancova", "mv_binomial", "mv_negbin"].includes(analysisId)
    || (analysisId === "mv_logistic" && (options as { firth?: boolean } | null)?.firth === true)) {
    return { figure: "ci", reading: null };
  }
  return { figure: null, reading: [250, 160, 80, 160] };
}

/** Text-shaped still bars: an inline run of `chars` invisible characters
 *  drawn as a filled box per line, so it wraps like the text it stands
 *  for at any width. The characters live in a pseudo-element, out of
 *  find-in-page and selection. */
const FILL = "xxxxxxxx xxxx xxxxxxx xxxxx xxxxxxxxx xx ";
const Bar = ({ chars }: { chars: number }) => (
  <span className="answer-sk-text"
    data-fill={FILL.repeat(Math.ceil(chars / FILL.length)).slice(0, chars).trimEnd()} />
);

/** Where the numbers on screen come from (DECISIONS 4), always two lines
 *  of room so a change of wording moves nothing. */
function provenance(p: { engineReady: boolean; failed: boolean; hasResult: boolean; live: boolean }): string {
  if (p.engineReady) return "Computed on this device for the data in the table.";
  if (!p.hasResult) {
    return p.failed ? "No result: the analysis engine did not load." : "Waiting for the analysis engine.";
  }
  return p.live ? "Computed on this device for the data in the table."
    : "Computed when this version was built. Recomputed here once the engine has loaded.";
}

function Item({ item }: { item: KeyItem }) {
  if (item.error) {
    return (
      <div className="answer-item is-error">
        <dt className="answer-name">{item.title}</dt>
        <dd className="answer-error-text">{item.error}</dd>
      </div>
    );
  }
  const f = item.figure;
  if (!f) return null;
  return (
    <div className={`answer-item${f.demoted ? " is-demoted" : ""}`}>
      <dt className="answer-name">
        <span className="answer-set">{item.title}</span>
        <span className="answer-param">{f.name}</span>
      </dt>
      {f.demoted && <dd className="answer-reason"><NumText text={f.demoted} /></dd>}
      <dd className="answer-figure">
        {f.words ? <NumText text={f.value} /> : <Num>{f.value}</Num>}
        {f.note && <span className="answer-note"> ({f.note})</span>}
      </dd>
      {f.ci && <dd className="answer-ci"><NumText text={f.ci} /></dd>}
      {f.facts.length > 0 && (
        <dd className="answer-facts">
          {f.facts.map((x, i) => (
            <span key={i}>{i > 0 && <span aria-hidden="true"> · </span>}<NumText text={x} /></span>
          ))}
        </dd>
      )}
    </div>
  );
}

export default function ResultsAnswer({ sheet, data, result, options, status, readOnly }: {
  sheet: ResultsSheet;
  data: DataSheet;
  result: unknown;
  options: unknown;
  status: AnalysisStatus;
  readOnly: boolean;
}) {
  const { engineReady, engineError, results } = useProject();
  const titleId = useId();
  const [all, setAll] = useState(false);
  const xUnit = concentrationUnit(data.table) || "M";
  const facts = useMemo(() => keyFacts(result, { xUnit }), [result, xUnit]);
  const checks = useChecks({ sheet, data, result, options, readOnly });
  const hasResult = result != null;
  const items = facts?.kind === "figures" ? facts.items.filter((i) => i.figure || i.error) : [];
  // a replicate map: one fit per experiment, summarised above the fit of
  // all the values (sheets/xy/experiments.ts)
  const across = useMemo(() => potencySummaries(result).length > 0, [result]);
  const shown = all ? items : items.slice(0, SHOWN);
  const shape = expectedShape(sheet.analysis, options, data.table);
  const pane = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (hasResult && pane.current) heldHeight.set(sheet.id, pane.current.offsetHeight);
  }, [hasResult, result, sheet.id, all]);
  const hold = hasResult ? undefined : heldHeight.get(sheet.id);

  return (
    <section ref={pane} className="pane pane-answer" aria-labelledby={titleId}
      style={hold ? { minHeight: hold } : undefined}>
      <div className="answer">
        <div className="answer-head">
          <h2 id={titleId} className="answer-title">{sheet.name}</h2>
          <p className="answer-provenance">{provenance({ engineReady, failed: !!engineError,
            hasResult, live: status.live })}</p>
        </div>
        {!hasResult ? (
          // The shape of the headline and its reading, so their arrival
          // moves nothing below them. Never while the engine failed to
          // load: the provenance line says so, and no result is coming.
          !engineError && (shape.figure || shape.reading) && (
            <div className="answer-skeleton" aria-hidden="true">
              {shape.figure && (
                <div className="answer-sk-figure">
                  <span /><span />{shape.figure === "ci" && <span className="answer-sk-ci" />}<span />
                </div>
              )}
              {shape.reading && (
                <div className="meaning-line">
                  <p className="meaning-sentence"><span className="answer-sk-label" /><Bar chars={shape.reading[0]} /></p>
                  <p className="meaning-misread"><Bar chars={shape.reading[1]} /></p>
                  <p className="meaning-test"><Bar chars={shape.reading[2]} /></p>
                  <p className="meaning-sources"><Bar chars={shape.reading[3]} /></p>
                </div>
              )}
            </div>
          )
        ) : facts?.kind === "error" ? (
          <div className="answer-failed" role="alert">
            <p className="answer-error-text">{facts.message}</p>
            {offersFirth(sheet.analysis, result) && !readOnly ? (
              // separated data: Firth's fit in one click (guide/FirthAction, P-89)
              <FirthAction resultsId={sheet.id} />
            ) : (
              <>
                <p className="answer-next">
                  Check the values in the table and the analysis options, then run it again.
                </p>
                {engineReady && !readOnly && (
                  <Button size="sm" onClick={() => results.forget(sheet.id)}>Run again</Button>
                )}
              </>
            )}
          </div>
        ) : items.length > 0 && (
          <>
            {across && <AcrossExperiments result={result} xUnit={xUnit} />}
            {across && (
              <h3 className="answer-group-label">All values in one fit: its CI counts wells, not experiments</h3>
            )}
            <dl className="answer-items" data-count={Math.min(items.length, SHOWN)}>
              {shown.map((it, i) => <Item key={`${it.title}-${i}`} item={it} />)}
            </dl>
            {items.length > SHOWN && (
              <Button size="sm" variant="ghost" className="answer-more" aria-expanded={all}
                onClick={() => setAll(!all)}>
                {all ? `Show the first ${SHOWN}` : `Show all ${items.length}`}
              </Button>
            )}
          </>
        )}
        <RankLine sheet={sheet} data={data} options={options} result={result} />
        <MeaningLine analysisId={sheet.analysis} chosen={!!currentChoice(sheet)} table={data.table}
          options={options} result={result} />
        <ResultsChecks sheet={sheet} data={data} result={result} options={options}
          readOnly={readOnly} checks={checks} />
      </div>
    </section>
  );
}
