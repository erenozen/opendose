// "What this means" under the results of every analysis: the key result
// in one plain sentence about the user's own groups, how that kind of
// result is often misread, the test that was run and why it fits, and
// the sources (report/meaning.ts). Mounted once by the shell's results
// pane, so no table type or analysis needs code of its own.
import { useMemo, useSyncExternalStore } from "react";
import { choiceFor, subscribeChoice } from "../guide/choice";
import type { DataTableModel } from "../project/types";
import { meaningOf } from "./meaning";
import { currentReportPrefs } from "./pformat";
import "./meaning.css";

export default function MeaningLine({ analysisId, resultsId, table, options, result }: {
  analysisId: string;
  /** The results sheet: when Help me choose opened it, its "Why this
   *  test" note above already names the test and why, so no Test line. */
  resultsId?: string;
  table: DataTableModel;
  options: unknown;
  result: unknown;
}) {
  const style = currentReportPrefs().pStyle;
  const m = useMemo(() => meaningOf({ analysisId, table, options, result, style }),
    [analysisId, table, options, result, style]);
  const chosen = useSyncExternalStore(subscribeChoice, () => (resultsId ? choiceFor(resultsId) : null));
  if (!m) return null;
  return (
    <section className="meaning-line" aria-label="What this means">
      <p className="meaning-sentence">
        <span className="meaning-label">What this means</span>{" "}
        {m.sentence}
      </p>
      {m.misreading && (
        <p className="meaning-misread">
          <span className="meaning-label">Often misread as</span>{" "}
          {m.misreading}
        </p>
      )}
      {m.test && !chosen && (
        <p className="meaning-test">
          <span className="meaning-label">Test</span>{" "}
          {m.test}
        </p>
      )}
      <p className="meaning-sources">
        {m.sources.length > 1 ? "Sources: " : "Source: "}
        {m.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && "; "}
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
          </span>
        ))}
      </p>
    </section>
  );
}
