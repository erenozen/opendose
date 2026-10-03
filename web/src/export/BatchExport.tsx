import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProject } from "../app/context";
import LiveGraph from "../layout/LiveGraph";
import { findSheet } from "../project/ops";
import type { ExportPrefs, GraphSheet } from "../project/types";
import { saveBlob, zipFiles } from "./download";
import { waitForPlot } from "./figure";
import { graphBlob, graphSvg } from "./graph";
import { svgPagesToPdf } from "./pdf";
import { EXTENSIONS, fileStem, uniqueStems } from "./settings";

interface Job {
  ids: string[];
  settings: ExportPrefs;
  /** PDF only: one file with a page per graph instead of a zip. */
  onePdf: boolean;
  archive: string;
  resolve: (summary: string) => void;
}

/**
 * "Export all graphs": draws each graph of the project off screen, one at
 * a time, at the export size, and saves them as a zip (or, for PDF, as
 * one multi-page file). Graphs whose results never arrive are skipped and
 * reported.
 */
export function useBatchExport() {
  const { project } = useProject();
  const [job, setJob] = useState<Job | null>(null);
  const [index, setIndex] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const collected = useRef<{ graph: GraphSheet; blob?: Blob; svg?: string }[]>([]);
  const skipped = useRef<string[]>([]);

  const run = useCallback((ids: string[], settings: ExportPrefs, archive: string,
    onePdf = false) => new Promise<string>((resolve) => {
    collected.current = [];
    skipped.current = [];
    setIndex(0);
    setJob({ ids, settings, onePdf, archive, resolve });
  }), []);

  const graph = job ? findSheet(project, job.ids[index]) as GraphSheet | undefined : undefined;

  useEffect(() => {
    if (!job) return;
    let live = true;
    const step = async () => {
      if (graph?.kind === "graph" && hostRef.current) {
        const gd = await waitForPlot(hostRef.current);
        if (!live) return;
        if (gd) {
          if (job.onePdf) {
            collected.current.push({ graph, svg: await graphSvg(gd, { ...job.settings,
              format: "svg", scaleText: false }, graph.settings.scheme) });
          } else {
            collected.current.push({ graph, blob: await graphBlob(gd,
              { ...job.settings, scaleText: false }, graph.settings.scheme) });
          }
        } else skipped.current.push(graph.name);
      }
      if (!live) return;
      if (index + 1 < job.ids.length) { setIndex(index + 1); return; }
      // Done: package what was collected.
      const s = job.settings;
      const done = collected.current;
      if (done.length) {
        if (job.onePdf) {
          saveBlob(await svgPagesToPdf(done.map((d) => ({
            svg: d.svg!, width: s.width, height: s.height }))), `${job.archive}.pdf`);
        } else {
          const stems = uniqueStems(done.map((d) => fileStem(d.graph.name)));
          const files = await Promise.all(done.map(async (d, i) => ({
            name: `${stems[i]}.${EXTENSIONS[s.format]}`,
            data: new Uint8Array(await d.blob!.arrayBuffer()),
          })));
          saveBlob(await zipFiles(files), `${job.archive}.zip`);
        }
      }
      const msg = `${done.length} graph${done.length === 1 ? "" : "s"} exported`
        + (skipped.current.length ? `; skipped (not drawn in time): ${skipped.current.join(", ")}` : "");
      job.resolve(msg);
      setJob(null);
    };
    step().catch(() => {
      job.resolve("Export failed. Try a smaller size or another format.");
      setJob(null);
    });
    return () => { live = false; };
    // graph identity changes with every project edit; the index drives this
  }, [job, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const host = job && graph?.kind === "graph" ? createPortal(
    <div ref={hostRef} className="export-host" aria-hidden="true"
      style={{ width: job.settings.width, height: job.settings.height }}>
      <LiveGraph key={graph.id} graph={graph} />
    </div>, document.body) : null;

  return {
    run, host, busy: !!job,
    progress: job ? `${Math.min(index + 1, job.ids.length)} of ${job.ids.length}` : "",
  };
}
