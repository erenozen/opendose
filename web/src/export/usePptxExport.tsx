import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useProject } from "../app/context";
import LiveGraph from "../layout/LiveGraph";
import { exportPage } from "../layout/pageExport";
import {
  masterLegend, pageDims, panelLetters, readingOrder, resolveLayout, seriesFromTraces,
  type ResolvedLayout, type TraceLike,
} from "../project/layout";
import { findSheet } from "../project/ops";
import type {
  DataSheet, ExportPrefs, GraphSheet, LayoutItem, LayoutSheet, Project,
} from "../project/types";
import { legendFor } from "../report/legendFor";
import { reportPrefsOf } from "../report/prefs";
import { softwareLabel } from "../report/useReport";
import { versionLabel } from "./cite";
import { saveBlob } from "./download";
import { waitForPlot } from "./figure";
import { graphPngBlob, graphSvg } from "./graph";
import {
  buildPptx, deckSize, mmToEmu, PPTX_MIME, pptxSheets, pxToEmu, type PptxScope, type PptxSlide,
  type Size,
} from "./pptx";
import { DEFAULT_EXPORT, fileStem } from "./settings";

interface Job {
  sheets: (GraphSheet | LayoutSheet)[];
  settings: ExportPrefs;
  notes: boolean;
  file: string;
  title: string;
  slides: (PptxSlide & { page?: Size; layout?: boolean })[];
  skipped: string[];
  resolve: (msg: string) => void;
}

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** The figure legend of a graph sheet (as under the graph). */
function graphLegend(p: Project, g: GraphSheet, resultOf: (id: string) => unknown): string {
  const data = findSheet(p, g.parentId) as DataSheet | undefined;
  if (!data || data.kind !== "data") return "";
  const bound = g.resultsId ? findSheet(p, g.resultsId) : undefined;
  const result = bound?.kind === "results"
    ? (bound.frozen ? bound.cached : resultOf(bound.id)) ?? null : null;
  try {
    return legendFor({
      data, table: data.table, graph: g, result,
      options: bound?.kind === "results" ? bound.options : null,
      prefs: reportPrefsOf(p.prefs), software: softwareLabel(),
    });
  } catch { return ""; }
}

/**
 * "Export graphs to PowerPoint": draws each graph (and each page layout)
 * off screen, one at a time, and writes a .pptx with one slide per figure:
 * the figure as an SVG picture with a PNG fallback, the sheet name as the
 * slide title and the figure legend in the notes (export/pptx.ts).
 */
export function usePptxExport() {
  const api = useProject();
  const [job, setJob] = useState<Job | null>(null);
  const [index, setIndex] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  const run = useCallback((scope: PptxScope, o: { notes: boolean }) => new Promise<string>((resolve) => {
    if (job) { resolve(""); return; }
    const p = api.store.project;
    const sheets = pptxSheets(p, scope);
    if (!sheets.length) { resolve("There are no graphs or layouts to export."); return; }
    const one = sheets.length === 1 ? sheets[0].name : "";
    const stem = fileStem(scope.kind === "all" ? p.title : one || p.title, "opendose-graphs");
    setIndex(0);
    setJob({
      sheets, notes: o.notes, file: `${stem}.pptx`, title: one || p.title,
      settings: { ...DEFAULT_EXPORT, ...(p.prefs.export ?? {}), transparent: false, scaleText: false },
      slides: [], skipped: [], resolve,
    });
  }), [job, api]);

  const sheet = job ? findSheet(api.project, job.sheets[index]?.id) : undefined;
  const layout: ResolvedLayout | null = sheet?.kind === "layout" ? resolveLayout(sheet) : null;

  useEffect(() => {
    if (!job) return;
    let live = true;
    const resultOf = (id: string) => api.results.get(id)?.result;
    const finish = () => {
      const { slides } = job;
      if (!slides.length) {
        job.resolve(`Nothing was exported: ${job.skipped.join(", ")} could not be drawn.`);
        setJob(null);
        return;
      }
      const size = deckSize(slides.map((s) => s.page ?? { cx: 0, cy: 0 }),
        slides.every((s) => s.layout));
      const deck = buildPptx({
        title: job.title, date: new Date().toISOString(), app: `OpenDose ${versionLabel()}`,
        size: size ?? undefined,
        // a deck of one page size: each page fills its slide, untitled
        slides: size ? slides.map((s) => ({ ...s, title: "", upscale: true })) : slides,
      });
      saveBlob(new Blob([deck as Uint8Array<ArrayBuffer>], { type: PPTX_MIME }), job.file);
      job.resolve(`Saved ${slides.length} slide${slides.length === 1 ? "" : "s"} to ${job.file}`
        + (job.skipped.length ? `; skipped (not drawn in time): ${job.skipped.join(", ")}` : "") + ".");
      setJob(null);
    };
    const step = async () => {
      const host = hostRef.current;
      if (sheet?.kind === "graph" && host) {
        const gd = await waitForPlot(host, 30000);
        if (!live) return;
        if (gd) {
          const s = job.settings;
          const svg = await graphSvg(gd, { ...s, format: "svg" }, sheet.settings.scheme);
          const png = await graphPngBlob(gd, { ...s, format: "png", dpi: 192 }, sheet.settings.scheme);
          const legend = graphLegend(api.project, sheet, resultOf);
          job.slides.push({
            title: sheet.name, notes: job.notes ? legend : "",
            alt: legend ? `${sheet.name}. ${legend}` : sheet.name,
            figure: { svg, png: new Uint8Array(await png.arrayBuffer()),
              size: { cx: pxToEmu(s.width), cy: pxToEmu(s.height) } },
          });
        } else job.skipped.push(sheet.name);
      } else if (sheet?.kind === "layout" && layout && host) {
        const placed = readingOrder(layout.items.filter(
          (i): i is Extract<LayoutItem, { kind: "graph" }> => i.kind === "graph" && !!i.graphId));
        for (const it of placed) {
          const el = host.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(it.id)}"]`);
          if (el) await waitForPlot(el, 30000);
          if (!live) return;
        }
        await frames();
        const entries = masterLegend(placed.map((it) => {
          const gd = host.querySelector(`[data-item-id="${CSS.escape(it.id)}"] .plot`) as
            (HTMLElement & { data?: TraceLike[] }) | null;
          return gd?.data ? seriesFromTraces(gd.data) : [];
        }));
        const opts = { dpi: 150, paper: true };
        const svg = await (await exportPage(host, layout, api.project, entries,
          { ...opts, format: "svg" })).text();
        const png = await exportPage(host, layout, api.project, entries, { ...opts, format: "png" });
        if (!live) return;
        const letters = panelLetters(layout.items, layout.letters);
        const notes = placed.map((it) => {
          const g = findSheet(api.project, it.graphId) as GraphSheet | undefined;
          if (g?.kind !== "graph") return "";
          const text = graphLegend(api.project, g, resultOf);
          const l = letters.get(it.id);
          return text ? `${l ? `(${l.replace(/[^\p{L}\p{N}]/gu, "")}) ` : ""}${text}` : "";
        }).filter(Boolean).join("\n");
        const { w, h } = pageDims(layout.page);
        const page = { cx: mmToEmu(w), cy: mmToEmu(h) };
        job.slides.push({
          title: sheet.name, notes: job.notes ? notes : "", alt: sheet.name, upscale: false,
          figure: { svg, png: new Uint8Array(await png.arrayBuffer()), size: page },
          page, layout: true,
        });
      } else if (sheet) job.skipped.push(sheet.name);
      if (!live) return;
      if (index + 1 < job.sheets.length) setIndex(index + 1);
      else finish();
    };
    step().catch(() => {
      job.resolve("The PowerPoint file could not be made. Try again, or export the graphs one by one.");
      setJob(null);
    });
    return () => { live = false; };
    // the step index drives this; sheet identity changes with every edit
  }, [job, index]); // eslint-disable-line react-hooks/exhaustive-deps

  let content: ReactNode = null;
  if (job && sheet?.kind === "graph") {
    content = (
      <div ref={hostRef} className="export-host" aria-hidden="true"
        style={{ width: job.settings.width, height: job.settings.height }}>
        <LiveGraph key={sheet.id} graph={sheet} />
      </div>
    );
  } else if (job && sheet?.kind === "layout" && layout) {
    const { w, h } = pageDims(layout.page);
    const mm = 96 / 25.4;
    content = (
      <div ref={hostRef} className="export-host" aria-hidden="true"
        style={{ width: w * mm, height: h * mm, display: "block" }}>
        {layout.items.map((it) => {
          if (it.kind !== "graph" || !it.graphId) return null;
          const g = findSheet(api.project, it.graphId);
          if (g?.kind !== "graph") return null;
          return (
            <div key={it.id} data-item-id={it.id} style={{ position: "absolute",
              left: it.x * mm, top: it.y * mm, width: it.w * mm, height: it.h * mm }}>
              <div className="layout-graph" style={{ position: "absolute", inset: 0,
                display: "flex", flexDirection: "column" }}>
                <LiveGraph graph={g} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return {
    run,
    busy: !!job,
    progress: job ? `${Math.min(index + 1, job.sheets.length)} of ${job.sheets.length}` : "",
    host: content ? createPortal(content, document.body) : null,
  };
}
