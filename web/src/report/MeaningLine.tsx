// "What this means" under the results of every analysis: the key result
// in one plain sentence about the user's own groups, how that kind of
// result is often misread, the test that was run and why it fits, and
// the sources (report/meaning.ts). Mounted once, in the results headline
// (components/ResultsAnswer.tsx), so no table type or analysis needs code
// of its own. Numbers in it never break across lines (NumText).
import { useMemo } from "react";
import { NumText } from "../components/ui";
import type { DataTableModel } from "../project/types";
import { meaningOf } from "./meaning";
import { currentReportPrefs } from "./pformat";
import "./meaning.css";

export default function MeaningLine({ analysisId, chosen = false, table, options, result }: {
  analysisId: string;
  /** Help me choose opened this sheet and its reason still applies: the
   *  "Why this test" note already names the test and why, so no Test line. */
  chosen?: boolean;
  table: DataTableModel;
  options: unknown;
  result: unknown;
}) {
  const style = currentReportPrefs().pStyle;
  const m = useMemo(() => meaningOf({ analysisId, table, options, result, style }),
    [analysisId, table, options, result, style]);
  if (!m) return null;
  return (
    <section className="meaning-line" aria-label="What this means">
      <p className="meaning-sentence">
        <span className="meaning-label">What this means</span>{" "}
        <NumText text={m.sentence} />
      </p>
      {m.misreading && (
        <p className="meaning-misread">
          <span className="meaning-label">Often misread as</span>{" "}
          <NumText text={m.misreading} />
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
