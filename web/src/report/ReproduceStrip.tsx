// The strip under the header after a project saved by another build is
// opened: "Checking 3 saved results…" while the engine recomputes them,
// then "All 48 results reproduced with OpenDose 0.4.0 (saved with
// 0.3.0)" or the numbers that changed, each with both values, and the
// engine change log as the why. Dismissable; the History panel keeps it.
import { useEffect } from "react";
import { useProject } from "../app/context";
import {
  dismissReproduceReport, settleReproduceCheck, useReproduceState,
} from "../app/reproduceCheck";
import { changedLines, headline, savedLabel, totals } from "../project/reproduce";
import { whyLines } from "../share/engineChanges";
import { openHistory } from "./useReport";
import "./report.css";
import "./integrity.css";

const SHOWN = 6;

export default function ReproduceStrip() {
  const { project, results } = useProject();
  const st = useReproduceState();
  const checking = !!st.progress;
  // Compare as recomputed results arrive (the cache notifies every change).
  useEffect(() => {
    if (!checking) return;
    const run = () => settleReproduceCheck(project, results);
    run();
    return results.subscribeAll(run);
  }, [checking, project, results]);

  if (st.progress) {
    const p = st.progress;
    return (
      <div className="reproduce-strip" role="region" aria-label="Reproducing saved results">
        <span role="status">
          Checking {p.total} saved result{p.total === 1 ? "" : "s"} of “{p.file}” (saved with{" "}
          {p.savedWith ? `OpenDose ${p.savedWith.app}` : "an earlier version"}) against this version:
          {" "}{p.done} of {p.total} recomputed…
        </span>
        <button type="button" className="dismiss" onClick={dismissReproduceReport}>Dismiss</button>
      </div>
    );
  }
  const r = st.latest;
  if (!r) return null;
  const t = totals(r);
  const lines = changedLines(r);
  const why = whyLines(r);
  const firstData = project.sheets.find((s) => s.id === r.sheets[0]?.sheetId);
  return (
    <div className={`reproduce-strip${t.changed ? " has-changes" : ""}`} role="region"
      aria-label="Reproducing saved results">
      <div className="rs-head">
        <span role="status" className="rs-headline">{headline(r)}.</span>
        <button type="button" onClick={() => openHistory(firstData?.kind === "results" ? firstData.parentId : undefined)}>
          History</button>
        <button type="button" className="dismiss" onClick={dismissReproduceReport}>Dismiss</button>
      </div>
      {lines.length > 0 && (
        <ul className="rs-changes" aria-label="Changed results">
          {lines.slice(0, SHOWN).map((l, i) => <li key={i}>{l}</li>)}
          {lines.length > SHOWN && <li>…and {lines.length - SHOWN} more (History lists them all)</li>}
        </ul>
      )}
      {t.changed > 0 && (
        <p className="rs-why">
          <strong>Why: </strong>
          {why.length ? (
            <>engine change log between {savedLabel(r.savedWith, r.current)} and {r.current.app}:{" "}
              {why.map((c) => c.note).join(" ")}</>
          ) : (
            <>no engine change between these versions is listed for these analyses; differences
              in the last digits can come from the numerical libraries
              {r.savedWith?.libraries?.scipy && r.current.libraries?.scipy
                ? ` (SciPy ${r.savedWith.libraries.scipy} then, ${r.current.libraries.scipy} now)` : ""}.</>
          )}
          {" "}Numbers are compared at the precision the results show (P values at four
          significant digits).
        </p>
      )}
      {r.sheets.some((s) => s.status === "failed" || s.status === "skipped") && (
        <ul className="rs-notes" aria-label="Not compared">
          {r.sheets.filter((s) => s.note).map((s) => <li key={s.sheetId}>{s.name}: {s.status === "failed"
            ? `could not be recomputed (${s.note})` : `not compared: ${s.note}`}</li>)}
        </ul>
      )}
    </div>
  );
}
