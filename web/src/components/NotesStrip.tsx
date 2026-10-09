import { useMemo } from "react";
import { analysisPlan, dataNotes } from "../project/dataNotes";
import type { DataTableModel } from "../project/types";
import { SRC, type Source } from "../guide/sources";
import { survivalWarnings } from "../sheets/survival/extras";
import { ANALYSIS_SURVIVAL } from "../project/builtin";
import "../sheets/common/dataNotes.css";

/**
 * The Notes strip on every results sheet: an "Analysed" line (n used per
 * group, or pairs / subjects, and what was left out) and every engine
 * warning or note, every cell skipped because it is not a number, every
 * excluded value and every incomplete pair (project/dataNotes.ts). Nothing
 * an analysis drops is left unsaid.
 */
export default function NotesStrip({ analysisId, table, options, result }: {
  analysisId: string;
  table: DataTableModel;
  options: unknown;
  result: unknown;
}) {
  const notes = useMemo(() => {
    if (result == null) return null;
    const n = dataNotes({ analysisId, table, options, result });
    // The survival results list the engine's warnings under the medians,
    // with the few-events rule and its sources: each is said once, there.
    if (analysisId !== ANALYSIS_SURVIVAL) return n;
    const there = survivalWarnings(result as Parameters<typeof survivalWarnings>[0]);
    return { ...n, notes: n.notes.filter((x) => x.from !== "engine" || !there.some((w) => x.text.endsWith(w.trim()))) };
  }, [analysisId, table, options, result]);
  if (!notes || (!notes.analysed && !notes.notes.length)) return null;
  const kind = analysisPlan(analysisId, table, options).kind;
  // The rules the Analysed line follows, with their sources.
  const sources: Source[] = kind === "pairs" ? [SRC.gpPairedT, SRC.sampl]
    : kind === "subjects" ? [SRC.gpMixed, SRC.sampl] : notes.analysed ? [SRC.sampl] : [];
  const warn = notes.notes.some((n) => n.tone === "warn");
  return (
    <section className={`notes-strip${warn ? " has-warn" : ""}`} aria-label="Notes on the data analysed">
      <h3>Notes</h3>
      {notes.analysed && (
        <p className="analysed-line"><strong>Analysed:</strong> {notes.analysed}.</p>
      )}
      {notes.notes.length > 0 && (
        <ul>
          {notes.notes.map((n, i) => (
            <li key={i} className={n.tone === "warn" ? "note-warn" : undefined}
              data-from={n.from}>{n.text}</li>
          ))}
        </ul>
      )}
      {sources.length > 0 && (
        <p className="note-source">
          {kind === "pairs" ? "Paired tests use only rows with both values. "
            : kind === "subjects" ? "Repeated-measures ANOVA uses only subjects with every value. " : ""}
          Report n analysed and what was left out:{" "}
          {sources.map((s, i) => (
            <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
          ))}.
        </p>
      )}
    </section>
  );
}
