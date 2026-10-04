// The engine's state where the results are: a progress bar while the
// engine boots, and a busy line ("Computing… 3.2 s" with Cancel) while a
// results sheet's analysis runs. Neither blocks anything: the engine runs
// in a worker, so the grid stays editable throughout.
import { useEffect, useState } from "react";
import type { AnalysisStatus } from "../app/useAnalysisResult";
import type { EngineState } from "../lib/engine";
import "./engineStatus.css";

/** A job running this long is called out, with Cancel kept at hand. */
export const LONG_JOB_S = 60;
/** Quick jobs show nothing (no flicker while typing). */
const SHOW_AFTER_S = 1;

function mb(n: number): string {
  return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1);
}

/** Download / start-up progress of the engine (null when it is up). */
export function EngineProgress({ engine, compact = false }: {
  engine: EngineState;
  compact?: boolean;
}) {
  const p = engine.progress;
  const frac = p && p.total > 0 ? Math.min(1, p.loaded / p.total) : 0;
  const downloading = p?.phase === "download" || (p && p.loaded < p.total * 0.995);
  const label = p?.message ?? (engine.phase === "restarting"
    ? "Restarting the analysis engine…" : "Starting the analysis engine…");
  return (
    <div className={`engine-progress${compact ? " compact" : ""}`}>
      <div className="engine-progress-text">
        <span>{label}</span>
        {p && p.total > 0 && downloading && (
          <span className="engine-progress-bytes">{mb(p.loaded)} of {mb(p.total)} MB</span>
        )}
      </div>
      <progress max={1} value={p && p.total > 0 ? frac : undefined}
        aria-label="Loading the analysis engine" />
    </div>
  );
}

/** Shown above results that are not (yet) the live engine's, while it loads. */
export function EngineBootNote({ engine, live }: { engine: EngineState; live: boolean }) {
  return (
    <div className="engine-boot-note" role="note">
      <p>
        {live
          ? "Saved results for this exact data. The live engine is loading."
          : "Results computed earlier for this example. The live engine is loading and will recompute them."}
      </p>
      <EngineProgress engine={engine} compact />
    </div>
  );
}

/** "Computing… 3.2 s · Cancel" for one results sheet. */
export function AnalysisBusy({ status, engine }: {
  status: AnalysisStatus;
  engine: EngineState;
}) {
  const { pending } = status;
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!pending) return;
    setNow(performance.now());
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [pending]);

  if (status.cancelled) {
    return (
      <div className="analysis-busy cancelled" role="status">
        <span>Calculation cancelled. The results below are out of date.</span>
        <button type="button" onClick={status.retry}>Run again</button>
      </div>
    );
  }
  if (!pending) return null;
  const elapsed = Math.max(0, (now - pending.startedAt) / 1000);
  if (elapsed < SHOW_AFTER_S) return null;
  const long = elapsed >= LONG_JOB_S;
  const waiting = engine.phase === "booting" || engine.phase === "restarting";
  const text = waiting ? "Waiting for the analysis engine…"
    : long ? "This is taking unusually long." : "Computing…";
  return (
    <div className={`analysis-busy${long ? " long" : ""}`} data-elapsed={elapsed.toFixed(1)}>
      <span className="spinner" aria-hidden="true" />
      <span role="status">{text}</span>
      <span className="analysis-busy-time" aria-hidden="true">{elapsed.toFixed(1)} s</span>
      <button type="button" onClick={pending.cancel}>Cancel</button>
    </div>
  );
}
