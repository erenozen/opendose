import { useEffect, useMemo, useRef, useState } from "react";
import { saidElsewhere } from "./notesElsewhere";
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
    // Engine messages another block states in full are said once, there:
    // the survival warnings under the medians (with the few-events rule
    // and its sources), and the withheld P in the "No P value" banner.
    const r = result as { withheld?: { text?: unknown } };
    const there = [
      ...(analysisId === ANALYSIS_SURVIVAL
        ? survivalWarnings(result as Parameters<typeof survivalWarnings>[0]) : []),
      ...(typeof r.withheld?.text === "string" ? [r.withheld.text] : []),
    ].map((w) => w.trim()).filter(Boolean);
    if (!there.length) return n;
    return { ...n, notes: n.notes.filter((x) => x.from !== "engine" || !there.some((w) => x.text.endsWith(w))) };
  }, [analysisId, table, options, result]);
  // Engine notes another block of the pane prints in full (a comparisons
  // table's note, a panel's warnings) are said once, there.
  const self = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const engineTexts = useMemo(() => (notes?.notes ?? []).map((n) => (n.from === "engine" ? n.text : "")),
    [notes]);
  useEffect(() => {
    const pane = self.current?.closest(".pane-results");
    if (!pane) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const elsewhere = [...pane.children].filter((c) => c !== self.current)
          .map((c) => c.textContent ?? "").join(" ");
        const next = saidElsewhere(engineTexts, elsewhere);
        setHidden((prev) => (prev.size === next.size && [...next].every((i) => prev.has(i)) ? prev : next));
      });
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(pane, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); cancelAnimationFrame(frame); };
  }, [engineTexts]);
  const shown = (notes?.notes ?? []).filter((_, i) => !hidden.has(i));
  if (!notes || (!notes.analysed && !notes.notes.length)) return null;
  // everything said elsewhere: keep the (hidden) element so it can tell
  // when a note stops being said elsewhere
  if (!notes.analysed && !shown.length) return <section ref={self} className="notes-strip" hidden />;
  const kind = analysisPlan(analysisId, table, options).kind;
  // The rules the Analysed line follows, with their sources.
  const sources: Source[] = kind === "pairs" ? [SRC.gpPairedT, SRC.sampl]
    : kind === "subjects" ? [SRC.gpMixed, SRC.sampl] : notes.analysed ? [SRC.sampl] : [];
  const warn = shown.some((n) => n.tone === "warn");
  return (
    <section ref={self} className={`notes-strip${warn ? " has-warn" : ""}`} aria-label="Notes on the data analysed">
      <h3>Notes</h3>
      {notes.analysed && (
        <p className="analysed-line"><strong>Analysed:</strong> {notes.analysed}.</p>
      )}
      {shown.length > 0 && (
        <ul>
          {shown.map((n, i) => (
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
