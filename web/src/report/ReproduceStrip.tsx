// The strip under the header after a project saved by another build is
// opened: "Checking 3 saved results…" while the engine recomputes them,
// then "All 48 results reproduced with OpenDose 0.4.0 (saved with
// 0.3.0)" or the numbers that changed, each with both values, and the
// engine change log as the why. The same after restoring an autosave or
// opening a share link saved by another build. Dismissable; the project
// keeps the report (History panel, saved with the file).
import { useEffect } from "react";
import { useProject } from "../app/context";
import {
  dismissReproduceReport, settleReproduceCheck, useReproduceState,
} from "../app/reproduceCheck";
import {
  changedLines, headline, savedLabel, totals, withReproduction,
} from "../project/reproduce";
import { whyLines } from "../share/engineChanges";
import { openHistory } from "./useReport";
import { announce, Banner, Button } from "../components/ui";
import "./report.css";
import "./integrity.css";

const SHOWN = 6;

export default function ReproduceStrip() {
  const { project, results, store } = useProject();
  const st = useReproduceState();
  const checking = !!st.progress;
  // Compare as recomputed results arrive (the cache notifies every change).
  // The finished report joins the project, outside undo history (also on
  // a read-only shared project, which it describes): saved with it, and
  // listed in History after reopening.
  useEffect(() => {
    if (!checking) return;
    const run = () => {
      const report = settleReproduceCheck(project, results);
      if (report) store.patchAll((p) => withReproduction(p, report));
    };
    run();
    return results.subscribeAll(run);
  }, [checking, project, results, store]);

  const r = st.latest;
  // Spoken once each: the check starting and its outcome; the running
  // count is shown, never read out.
  useEffect(() => { if (checking) announce("Checking the saved results against this version."); }, [checking]);
  useEffect(() => { if (r) announce(`${headline(r)}.`); }, [r]);
  const p = st.progress;
  const open = !!p || !!r;
  const t = r ? totals(r) : null;
  const lines = r ? changedLines(r) : [];
  const why = r ? whyLines(r) : [];
  const firstData = r ? project.sheets.find((s) => s.id === r.sheets[0]?.sheetId) : undefined;
  return (
    <Banner className="reproduce-strip" open={open} aria-label="Reproducing saved results"
      tone={p ? "info" : t?.changed ? "warn" : "success"}>
      {p ? (
        <>
          <Banner.Title>
            Checking {p.total} saved result{p.total === 1 ? "" : "s"} of{" "}
            {p.source === "autosave" ? "your last session " : p.source === "link" ? "the shared project " : ""}
            “{p.file}” (saved with{" "}
            {p.savedWith ? `OpenDose ${p.savedWith.app}` : "an earlier version"}) against this version:
            {" "}{p.done} of {p.total} recomputed…
          </Banner.Title>
          <Banner.Actions>
            <Button onClick={dismissReproduceReport}>Dismiss</Button>
          </Banner.Actions>
        </>
      ) : r && t && (
        <>
          <Banner.Title className="rs-headline">{headline(r)}.</Banner.Title>
          {lines.length > 0 && (
            <Banner.Detail>
              <ul className="rs-changes" aria-label="Changed results">
                {lines.slice(0, SHOWN).map((l, i) => <li key={i}>{l}</li>)}
                {lines.length > SHOWN && <li>…and {lines.length - SHOWN} more (History lists them all)</li>}
              </ul>
            </Banner.Detail>
          )}
          {t.changed > 0 && (
            <Banner.Detail className="rs-why">
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
            </Banner.Detail>
          )}
          {r.sheets.some((s) => s.status === "failed" || s.status === "skipped") && (
            <Banner.Detail>
              <ul className="rs-notes" aria-label="Not compared">
                {r.sheets.filter((s) => s.note).map((s) => <li key={s.sheetId}>{s.name}: {s.status === "failed"
                  ? `could not be recomputed (${s.note})` : `not compared: ${s.note}`}</li>)}
              </ul>
            </Banner.Detail>
          )}
          <Banner.Actions>
            <Button onClick={() => openHistory(firstData?.kind === "results" ? firstData.parentId : undefined)}>
              History</Button>
            <Button onClick={dismissReproduceReport}>Dismiss</Button>
          </Banner.Actions>
        </>
      )}
    </Banner>
  );
}
