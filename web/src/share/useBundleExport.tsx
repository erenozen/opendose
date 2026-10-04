import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import { citation, librariesPhrase, versionLabel } from "../export/cite";
import { saveBlob } from "../export/download";
import { waitForPlot } from "../export/figure";
import { graphPngBlob, graphSvg } from "../export/graph";
import { DEFAULT_EXPORT } from "../export/settings";
import LiveGraph from "../layout/LiveGraph";
import { getEngine, getRuntimeVersions } from "../lib/engine";
import { exportPzfx, pzfxSelection } from "./pzfx";
import { findSheet } from "../project/ops";
import { serializeProject } from "../project/persist";
import type { DataSheet, ExportPrefs, GraphSheet } from "../project/types";
import { resultsMatrix } from "../sheets/common/download";
import { analysisDef } from "../sheets/registry";
import { bundleFiles, stem, zipBundle, type BundleInput } from "./bundle";
import { legendFor } from "../report/legendFor";
import { reportPrefsOf } from "../report/prefs";
import { projectProvenance } from "../report/provenance";
import { provenanceDeps, provenanceEnv } from "../report/provenanceDeps";
import { softwareLabel } from "../report/useReport";
import OffscreenResults from "./OffscreenResults";

type Step = { kind: "results"; id: string } | { kind: "graph"; id: string };

interface Job {
  steps: Step[];
  input: BundleInput;
  settings: ExportPrefs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * "Download export bundle": the project file, every data table as CSV
 * (wide and long), every results sheet as CSV, every graph as SVG and
 * PNG, methods text, citation and a README, in one zip. Results panels and
 * graphs are drawn off screen one at a time (as "Export all graphs"
 * does) and read back exactly as the app shows them.
 */
export function useBundleExport() {
  const api = useProject();
  const ui = useUi();
  const [job, setJob] = useState<Job | null>(null);
  const [index, setIndex] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async () => {
    if (job) return;
    if (!api.engineReady) {
      ui.notify("The analysis engine is still starting; try again in a moment.");
      return;
    }
    const p = api.store.project;
    const v = getRuntimeVersions();
    const input: BundleInput = {
      title: p.title,
      projectJson: serializeProject(p, api.results.snapshot()),
      tables: p.sheets.filter((s): s is DataSheet => s.kind === "data")
        .map((s) => ({ name: s.name, table: s.table })),
      results: [], graphs: [], methods: [],
      citation: citation(v),
      app: `OpenDose ${versionLabel()}`,
      libraries: librariesPhrase(v),
      date: new Date().toISOString(),
      skipped: [],
      legends: [],
      provenance: JSON.stringify(projectProvenance(p, provenanceDeps(api.results), provenanceEnv()), null, 2),
    };
    // The tables as .pzfx too, for collaborators who use Prism.
    try {
      const sel = pzfxSelection(p);
      if (sel.tables.length) {
        const px = exportPzfx(await getEngine(), sel);
        if ("xml" in px) input.pzfx = px.xml;
      }
    } catch { /* the bundle goes ahead without it */ }
    const steps: Step[] = [
      ...p.sheets.filter((s) => s.kind === "results").map((s) => ({ kind: "results" as const, id: s.id })),
      ...p.sheets.filter((s) => s.kind === "graph").map((s) => ({ kind: "graph" as const, id: s.id })),
    ];
    const settings: ExportPrefs = {
      ...DEFAULT_EXPORT, ...(p.prefs.export ?? {}), transparent: false, scaleText: false,
    };
    setIndex(0);
    setJob({ steps, input, settings });
  }, [job, api, ui]);

  const step = job?.steps[index];
  const sheet = step ? findSheet(api.project, step.id) : undefined;

  useEffect(() => {
    if (!job) return;
    let live = true;
    const finish = () => {
      const files = bundleFiles(job.input);
      const zip = zipBundle(files);
      saveBlob(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
        `${stem(job.input.title, "opendose-project")}-bundle.zip`);
      ui.notify(`Export bundle saved: ${files.length} files`
        + (job.input.skipped.length ? `; not included: ${job.input.skipped.join(", ")}` : "") + ".");
      setJob(null);
    };
    const go = async () => {
      if (!step) { finish(); return; }
      const host = hostRef.current;
      if (sheet?.kind === "graph" && host) {
        const gd = await waitForPlot(host, 30000);
        if (!live) return;
        if (gd) {
          const svg = await graphSvg(gd, { ...job.settings, format: "svg" }, sheet.settings.scheme);
          const png = await graphPngBlob(gd, { ...job.settings, format: "png" }, sheet.settings.scheme);
          job.input.graphs.push({ name: sheet.name, svg, png: new Uint8Array(await png.arrayBuffer()) });
        } else job.input.skipped.push(sheet.name);
        const data = findSheet(api.project, sheet.parentId) as DataSheet | undefined;
        const bound = sheet.resultsId ? findSheet(api.project, sheet.resultsId) : undefined;
        if (data?.kind === "data") {
          const result = bound?.kind === "results"
            ? (bound.frozen ? bound.cached : api.results.get(bound.id)?.result) ?? null : null;
          job.input.legends!.push({ name: sheet.name, kind: "graph", text: legendFor({
            data, table: data.table, graph: sheet as GraphSheet, result,
            options: bound?.kind === "results" ? bound.options : null,
            prefs: reportPrefsOf(api.project.prefs), software: softwareLabel(),
          }) });
        }
      } else if (sheet?.kind === "results" && host) {
        // Wait for the result, then for the panel's code and paint.
        const t0 = Date.now();
        while (live && Date.now() - t0 < 30000) {
          const has = sheet.frozen || api.results.get(sheet.id)?.result != null;
          if (has && host.querySelector(".bundle-results")?.childElementCount
            && !host.querySelector("[aria-busy=true]")) break;
          await sleep(100);
        }
        await frames();
        if (!live) return;
        const data = findSheet(api.project, sheet.parentId) as DataSheet | undefined;
        const matrix = resultsMatrix(host.querySelector<HTMLElement>(".bundle-results"));
        if (matrix.length && data) {
          job.input.results.push({
            name: sheet.name,
            analysis: analysisDef(data.table.type, sheet.analysis)?.label ?? sheet.analysis,
            data: data.name, matrix,
          });
        } else job.input.skipped.push(sheet.name);
        const methods = host.querySelector(".bundle-methods .methods-text p")?.textContent?.trim();
        const stats = host.querySelector(".bundle-methods .stats-methods > p")?.textContent?.trim();
        if (methods) job.input.methods.push({ name: sheet.name, text: stats && stats !== methods ? `${methods}\n\n${stats}` : methods });
        const sentence = host.querySelector(".bundle-report .report-sentence p")?.textContent?.trim();
        if (sentence) job.input.legends!.push({ name: sheet.name, kind: "results", text: sentence });
      }
      if (!live) return;
      if (index + 1 < job.steps.length) setIndex(index + 1);
      else finish();
    };
    go().catch(() => {
      ui.notify("The export bundle could not be made. Try again, or export the parts one by one.");
      setJob(null);
    });
    return () => { live = false; };
    // the step index drives this; sheet identity changes with every edit
  }, [job, index]); // eslint-disable-line react-hooks/exhaustive-deps

  let content: React.ReactNode = null;
  if (job && sheet?.kind === "graph") {
    content = (
      <div ref={hostRef} className="export-host" aria-hidden="true"
        style={{ width: job.settings.width, height: job.settings.height }}>
        <LiveGraph key={sheet.id} graph={sheet as GraphSheet} />
      </div>
    );
  } else if (job && sheet?.kind === "results") {
    content = (
      <div ref={hostRef} className="export-host bundle-host" aria-hidden="true">
        <OffscreenResults key={sheet.id} sheet={sheet} />
      </div>
    );
  }
  return {
    run,
    busy: !!job,
    progress: job ? `${Math.min(index + 1, job.steps.length)} of ${job.steps.length}` : "",
    host: content ? createPortal(content, document.body) : null,
  };
}
