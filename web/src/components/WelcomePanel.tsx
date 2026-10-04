import type { EngineState } from "../lib/engine";
import { EngineProgress } from "./EngineStatus";

export function Logo() {
  // Dose-response sigmoid in a rounded tile: the OpenDose mark.
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7"
        fill="var(--accent-fill)" />
      <path d="M5 8.5 C 12 8.5 10.5 19.5 17.5 19.5 L 23 19.5"
        fill="none" stroke="var(--accent-ink)" strokeWidth="2.2"
        strokeLinecap="round" transform="rotate(180 14 14)" />
      <circle cx="14" cy="14" r="1.9" fill="var(--accent-ink)" />
    </svg>
  );
}

export default function WelcomePanel({ status, error, onRetry, engine }: {
  status: string;
  error?: string | null;
  onRetry?: () => void;
  /** Boot progress of the engine (a progress bar instead of a spinner). */
  engine?: EngineState;
}) {
  return (
    <div className="welcome">
      <div className="welcome-head">
        <Logo />
        <h2>Curve fitting &amp; biostatistics, in your browser</h2>
      </div>
      <p className="welcome-tagline">
        Fit dose-response curves, run the standard statistics toolbox, and
        analyze survival data, powered by real SciPy running entirely on
        your device. Nothing is uploaded, ever.
      </p>
      <ul>
        <li>Keep every data table, its results and graphs in one project;
          the navigator on the left lists them all.</li>
        <li>Paste data straight from Excel; tab-separated blocks expand
          automatically.</li>
        <li>Open a Prism file (.prism or .pzfx) or an OpenDose project with
          the Open button above, or import an SRB/MTT plate reading.</li>
      </ul>
      {error ? (
        <div className="welcome-error" role="alert">
          <p>Could not load the analysis engine: {error}</p>
          <button className="retry-btn" onClick={onRetry}>Try again</button>
        </div>
      ) : engine ? (
        <div role="status">
          <EngineProgress engine={engine} />
          <p className="welcome-loading-note">
            The first visit downloads the scientific runtime (about 30 MB);
            it is kept on this device for quick, offline-capable starts after
            that. You can enter data meanwhile: results appear as soon as it
            is ready.
          </p>
        </div>
      ) : (
        <div className="welcome-loading">
          <span className="spinner" aria-hidden="true" />
          <div>{status || "Starting the analysis engine…"}</div>
        </div>
      )}
    </div>
  );
}
