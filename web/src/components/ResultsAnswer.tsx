// The results headline (DECISIONS 3, "Answer first"): the pane at the top
// of the results column, above the graph and the full table. The sheet's
// name and where its numbers come from (DECISIONS 4, provenance), then
// for each data set (up to three, then "Show all") the key estimate in
// large figures with its CI line and its R² / n line (components/answer/
// keyFacts.ts), the plain-language reading (report/MeaningLine) at a 65ch
// measure, and the Checks row that discloses the guidance. Results no
// mapper knows show only the reading and the Checks row: the table below
// is their answer.
import { useId, useMemo, useState } from "react";
import { useProject } from "../app/context";
import type { AnalysisStatus } from "../app/useAnalysisResult";
import type { DataSheet, ResultsSheet } from "../project/types";
import MeaningLine from "../report/MeaningLine";
import { concentrationUnit } from "../sheets/xy/rangeReport";
import { keyFacts, type KeyItem } from "./answer/keyFacts";
import ResultsChecks from "./ResultsChecks";
import { useChecks } from "./useChecks";
import { Button, Num, NumText } from "./ui";
import "./answer/answer.css";

const SHOWN = 3;

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
        <Num>{f.value}</Num>
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
  const shown = all ? items : items.slice(0, SHOWN);

  return (
    <section className="pane pane-answer" aria-labelledby={titleId}>
      <div className="answer">
        <div className="answer-head">
          <h2 id={titleId} className="answer-title">{sheet.name}</h2>
          <p className="answer-provenance">{provenance({ engineReady, failed: !!engineError,
            hasResult, live: status.live })}</p>
        </div>
        {!hasResult ? (
          // The shape of a headline, so its arrival moves nothing.
          <div className="answer-skeleton" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        ) : facts?.kind === "error" ? (
          <div className="answer-failed" role="alert">
            <p className="answer-error-text">{facts.message}</p>
            <p className="answer-next">
              Check the values in the table and the analysis options, then run it again.
            </p>
            {engineReady && !readOnly && (
              <Button size="sm" onClick={() => results.forget(sheet.id)}>Run again</Button>
            )}
          </div>
        ) : items.length > 0 && (
          <>
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
        <MeaningLine analysisId={sheet.analysis} resultsId={sheet.id} table={data.table}
          options={options} result={result} />
        <ResultsChecks sheet={sheet} data={data} result={result} options={options}
          readOnly={readOnly} checks={checks} />
      </div>
    </section>
  );
}
