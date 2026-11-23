// The engine's state where the results are: a fixed slot with the boot
// phase (DECISIONS 4), the boot banner above saved results, and a busy
// line ("Computing… 3.2 s" with Cancel) while a results sheet's analysis
// runs. None of them blocks anything: the engine runs in a worker, so the
// grid stays editable throughout.
import { useEffect, useState, type ReactNode } from "react";
import type { AnalysisStatus } from "../app/useAnalysisResult";
import type { EngineState } from "../lib/engine";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import "./engineStatus.css";

/** A job running this long is called out, with Cancel kept at hand. */
export const LONG_JOB_S = 60;
/** Quick jobs show nothing (no flicker while typing). */
const SHOW_AFTER_S = 1;

function mb(n: number): string {
  return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1);
}

type EnginePhaseKey = "download" | "start" | "restart" | "ready" | "failed";

/** The phase in words: what the slot's live region says. Bytes are not
 *  part of it, so each phase is spoken once and the counter never. */
function enginePhase(engine: EngineState): { key: EnginePhaseKey; words: string } {
  if (engine.phase === "ready") return { key: "ready", words: "Ready: analyses run on this device" };
  if (engine.phase === "failed") return { key: "failed", words: "The analysis engine did not load" };
  if (engine.phase === "restarting") return { key: "restart", words: "Restarting the analysis engine" };
  if (!engine.progress || engine.progress.phase === "download") {
    return { key: "download", words: "Downloading the analysis engine" };
  }
  return { key: "start", words: "Starting the analysis engine" };
}

/** "9.4 of 31 MB" while the runtime is (or was, when it failed)
 *  downloading, else null. */
function engineBytes(engine: EngineState): string | null {
  const p = engine.progress;
  if (!p || p.total <= 0 || p.loaded >= p.total * 0.995) return null;
  return `${mb(p.loaded)} of ${mb(p.total)} MB`;
}

/** The engine boot slot (DECISIONS 4): always mounted at a fixed size
 *  (340 x 34), so the boot and its end move nothing. A dot, the phase
 *  words (the only live region), the bytes in tabular figures (hidden
 *  from screen readers), Try again after a failure, and a 2px bar drawn
 *  with transform: scaleX. */
function EngineSlot({ engine, onRetry }: { engine: EngineState; onRetry?: () => void }) {
  const { key, words } = enginePhase(engine);
  const p = engine.progress;
  const frac = key === "ready" ? 1 : p && p.total > 0 ? Math.min(1, p.loaded / p.total) : 0;
  const bytes = key === "download" ? engineBytes(engine) : null;
  return (
    <div className="engine-slot" data-engine-phase={key}>
      <span className="engine-slot-dot" aria-hidden="true" />
      <span className="engine-slot-words" role="status">{words}</span>
      {bytes && <span className="engine-slot-bytes" aria-hidden="true">{bytes}</span>}
      {key === "failed" && onRetry && (
        <Button size="sm" className="engine-slot-retry" onClick={onRetry}>Try again</Button>
      )}
      <span className="engine-slot-bar" aria-hidden="true">
        <span className="engine-slot-fill" style={{ transform: `scaleX(${frac})` }} />
      </span>
    </div>
  );
}

/** Several texts in one cell: the cell keeps the height of the tallest,
 *  so swapping between them moves nothing below. */
function SameHeight({ shown, items }: { shown: number; items: ReactNode[] }) {
  return (
    <span className="same-height">
      {items.map((c, i) => (
        <span key={i} className="same-height-item" data-shown={i === shown}>{c}</span>
      ))}
    </span>
  );
}

/** Above the results while the engine loads: saved results that
 *  are not (yet) the live engine's, or none yet for a new or pasted table.
 *  It stays mounted once the engine is up and swaps to "Results are live"
 *  at the same height, so the plot and the results below do not jump
 *  while they are read. Shown only when the workspace opened before the
 *  engine was ready; gone on the next family. */
export function EngineBootBanner({ engine, ready, live, hasResult, fitted, onRetry }: {
  engine: EngineState;
  /** The workspace's own "engine is up" (results are recomputed). */
  ready: boolean;
  /** The saved results are for exactly this data (a saved project). */
  live: boolean;
  /** Saved results are on screen (else the panes hold skeletons). */
  hasResult: boolean;
  /** The table's analysis is a curve fit ("Nothing could be fitted"). */
  fitted?: boolean;
  onRetry: () => void;
}) {
  const [booting] = useState(!ready);
  // The wording is chosen once, so the banner keeps one height.
  const [saved] = useState(hasResult);
  const [open, setOpen] = useState(true);
  if (!booting) return null;
  const failed = !ready && engine.phase === "failed";
  const stopped = engineBytes(engine);
  // Dismissable in every phase, so the dismiss button's column is there
  // from the start and the swap to "Results are live" rewraps nothing.
  // The banner is the pane itself, so dismissing it leaves no empty pane.
  return (
    <Banner className="pane pane-boot engine-boot-note" aria-label="Analysis engine" open={open}
      tone={failed ? "error" : ready ? "success" : "info"}
      onDismiss={() => setOpen(false)} dismissLabel="Dismiss the engine note">
      {failed && !hasResult ? (
        // Nothing on screen to keep: the result area says so (DECISIONS 4).
        <>
          <Banner.Title>
            Nothing could be {fitted ? "fitted" : "analysed"}: the analysis engine did not load.
          </Banner.Title>
          <Banner.Detail>
            Your table is kept. Check the connection, then try again.
          </Banner.Detail>
        </>
      ) : failed ? (
        <>
          <Banner.Title>
            The analysis engine did not load{stopped ? `: the download stopped at ${stopped}` : ""}.
          </Banner.Title>
          <Banner.Detail>
            These are saved results; edits are not analysed until it loads. Check the
            connection, then try again.
          </Banner.Detail>
        </>
      ) : (
        <>
          <Banner.Title>
            <SameHeight shown={ready ? 1 : 0} items={[
              !saved ? "Your table is analysed as soon as the engine has loaded."
                : live ? "Saved results for this exact data." : "Saved results for this example.",
              "Results are live.",
            ]} />
          </Banner.Title>
          <Banner.Detail>
            <SameHeight shown={ready ? 1 : 0} items={[
              !saved ? "The first visit downloads it once (about 30 MB); later visits start "
                + "from this device. You can edit the table meanwhile."
                : live ? "The live engine is loading." : "The live engine is loading and will recompute them.",
              saved ? "Recomputed on this device. Edits are analysed as you type."
                : "Computed on this device. Edits are analysed as you type.",
            ]} />
          </Banner.Detail>
        </>
      )}
      <Banner.Detail className="engine-boot-slot">
        <EngineSlot engine={engine} />
      </Banner.Detail>
      {failed && (
        <Banner.Actions>
          <Button variant="primary" onClick={onRetry}>Try again</Button>
        </Banner.Actions>
      )}
    </Banner>
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
