// What a plot box says while it has no graph to show:
// the graph library is still downloading, it failed to download, or the
// analysis behind the graph failed. The note is a React child of the
// plot's own div, drawn before Plotly has drawn anything (or after the
// plot was purged), so the box keeps its size and nothing moves when
// the graph arrives.
import { Button } from "../components/ui";
import type { PlotLoad } from "./usePlotLoad";

/** The note inside an empty plot box; nothing once the graph is drawn. */
export function PlotStatus({ load, failed, pending, onRetry }: {
  load: PlotLoad;
  /** The analysis behind the graph failed: there is nothing to draw. */
  failed?: boolean;
  /** Nothing drawn yet (no result, or Plotly not loaded). */
  pending?: boolean;
  onRetry: () => void;
}) {
  if (load === "failed") {
    return (
      <div className="plot-status">
        <p>The graph could not load: the graph library did not download. Check the connection,
          then try again.</p>
        <Button size="sm" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  if (failed) {
    return (
      <div className="plot-status">
        <p>No graph: the analysis failed. The results say why.</p>
      </div>
    );
  }
  if (load === "loading" || pending) {
    return <div className="plot-status" aria-busy="true"><p>Loading graph…</p></div>;
  }
  return null;
}
