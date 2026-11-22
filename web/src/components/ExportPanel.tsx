import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useProject } from "../app/context";
import { useBatchExport } from "../export/BatchExport";
import { canCopySvg, copyGraphImage } from "../export/clipboard";
import { saveBlob } from "../export/download";
import { graphBlob, graphPngBlob, graphSmallestPt, graphSvg } from "../export/graph";
import { PPTX_EDIT_HINT } from "../export/officeText";
import { openPptxExport } from "../share/events";
import {
  applyPreset, belowFontFloor, DPI_CHOICES, EXTENSIONS, FONT_FLOOR_PT, FORMATS, fileStem,
  fromUnit, isVector, JOURNAL_PRESETS, physicalLabel, rasterSize, supportsTransparency,
  toUnit, tooLarge,
} from "../export/settings";
import { useExportSettings } from "../export/useExportSettings";
import { DENSE_POINTS, hasWebglTraces } from "../graph/dense";
import type { SchemeId } from "../lib/palette";
import type { ExportFormat, ExportPrefs } from "../project/types";
import { Button, notify, NumberField, SwapLabel, useLabelSwap } from "./ui";
import Popover from "./ui/Popover";
import { belowStickyHeader } from "./ui/Popover.anchor";

/**
 * Export strip under a graph: format, size, resolution, Download and
 * Copy, plus an Options popover (units, journal sizes, background, colour
 * handling, export of every graph at once, PowerPoint). The last settings
 * are kept with the project.
 *
 * Feedback (DECISIONS 6): Download and Copy say they worked by swapping
 * their own label; a failure is an error toast with the next step; the
 * export of every graph is a progress toast that resolves in place.
 */
export default function ExportPanel({
  filename = "opendose-graph", leading, scheme, graphId,
}: {
  /** File name without extension (normally from the sheet name). */
  filename?: string;
  /** Rendered at the start of the strip, so graph controls share one row. */
  leading?: ReactNode;
  /** The graph's colour scheme, for mapping dark-theme colours to print. */
  scheme?: SchemeId;
  /** The graph sheet shown (for "Export to PowerPoint" of this graph). */
  graphId?: string;
}) {
  const { project } = useProject();
  const [settings, setSettings] = useExportSettings();
  const s = settings;
  const [width, setWidth] = useState(() => String(toUnit(s.width, s.unit)));
  const [height, setHeight] = useState(() => String(toUnit(s.height, s.unit)));
  const [dpi, setDpi] = useState(() => String(s.dpi));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [onePdf, setOnePdf] = useState(true);
  const [minPt, setMinPt] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const batch = useBatchExport();
  const downloaded = useLabelSwap();
  const copied = useLabelSwap();

  // Effective settings: what is typed now, falling back to the stored values.
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v.trim().replace(",", ".")));
  const typedW = num(width);
  const typedH = num(height);
  const eff: ExportPrefs = {
    ...s,
    width: Math.max(Number.isFinite(typedW) && typedW > 0 ? fromUnit(typedW, s.unit) : s.width, 100),
    height: Math.max(Number.isFinite(typedH) && typedH > 0 ? fromUnit(typedH, s.unit) : s.height, 100),
    dpi: Math.min(Math.max(num(dpi) || s.dpi, 36), 2400),
  };
  const vector = isVector(eff.format);
  const px = rasterSize(eff.width, eff.height, eff.dpi);

  const commit = (patch: Partial<ExportPrefs>) => setSettings({ ...eff, ...patch });
  const resync = (next: ExportPrefs) => {
    setWidth(String(toUnit(next.width, next.unit)));
    setHeight(String(toUnit(next.height, next.unit)));
    setDpi(String(next.dpi));
  };

  const target = () => (panelRef.current?.closest(".plot-card")
    ?.querySelector<HTMLElement>(".plot.js-plotly-plot")
    ?? document.querySelector<HTMLElement>(".plot.js-plotly-plot"));

  // Font floor: smallest text at the exported size.
  const { width: ew, height: eh, scaleText } = eff;
  useEffect(() => {
    const gd = target();
    setMinPt(gd ? graphSmallestPt(gd, { ...s, width: ew, height: eh, scaleText }) : null);
  }, [ew, eh, scaleText, open, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const file = (ext: string) => `${filename}.${ext}`;
  // Failures name the graph as the user named it (the sheet), not its file.
  const graphName = project.sheets.find((x) => x.id === graphId)?.name ?? filename;
  const failed = (verb: string, why: string) =>
    notify(`Could not ${verb} “${graphName}”: ${why}`, { tone: "error" });

  const download = async () => {
    const gd = target();
    if (!gd) return;
    setNote("");
    if (!vector && tooLarge(px.w, px.h)) {
      failed("export", `${px.w} × ${px.h} px is too large to render. Lower the DPI or the size.`);
      return;
    }
    setSettings(eff);
    setBusy(true);
    try {
      const blob = await graphBlob(gd, eff, scheme);
      const name = file(EXTENSIONS[eff.format]);
      saveBlob(blob, name);
      downloaded.flash(`Downloaded “${name}”.`);
      // Dense graphs draw their points with WebGL (graph/dense.ts): a
      // vector file then holds those points as an embedded image.
      if (vector && hasWebglTraces(gd)) {
        setNote(`This graph has more than ${DENSE_POINTS.toLocaleString("en-US")} points, drawn with WebGL: `
          + `in the ${eff.format.toUpperCase()} file they are one embedded image; axes, text and lines stay vector.`);
      }
    } catch {
      failed("export", "it did not render at that size. Try a smaller size or a lower DPI.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const gd = target();
    if (!gd) return;
    setNote("");
    const png = { ...eff, format: "png" as const };
    const size = rasterSize(png.width, png.height, png.dpi);
    if (tooLarge(size.w, size.h)) {
      failed("copy", `${size.w} × ${size.h} px is too large to copy. Lower the DPI or the size.`);
      return;
    }
    const svg = canCopySvg();
    const outcome = await copyGraphImage(() => graphPngBlob(gd, png, scheme),
      () => graphSvg(gd, { ...eff, format: "svg" }, scheme));
    if (outcome === "copied") {
      copied.flash(svg ? "Copied as PNG and SVG: paste into Word or PowerPoint."
        : "Copied as PNG: paste into Word or PowerPoint.");
    }
    else {
      // No image clipboard here (or permission refused): download instead.
      try {
        const name = file("png");
        saveBlob(await graphPngBlob(gd, png, scheme), name);
        notify(`This browser cannot copy pictures, so “${name}” was downloaded instead.`,
          { tone: "info" });
      } catch {
        failed("copy", "the browser refused the picture. Use Download instead.");
      }
    }
  };

  const exportAll = async () => {
    const ids = project.sheets.filter((x) => x.kind === "graph").map((x) => x.id);
    if (!ids.length) return;
    setNote("");
    setSettings(eff);
    // A long operation: one progress toast, resolved in place.
    const id = "export-all-graphs";
    notify(`Exporting ${ids.length} graph${ids.length === 1 ? "" : "s"}…`, { tone: "progress", id });
    const msg = await batch.run(ids, eff, `${fileStem(project.title, "opendose")}-graphs`,
      eff.format === "pdf" && onePdf);
    notify(msg, { tone: /^Could not/.test(msg) ? "error" : "success", id });
  };

  const setFormat = (f: ExportFormat) => commit({ format: f });
  const graphCount = project.sheets.filter((x) => x.kind === "graph").length;
  const working = busy || batch.busy;

  return (
    <div className="export-panel" ref={panelRef}>
      {leading}
      <div className="export-actions">
        <Button onClick={download} disabled={batch.busy} busy={busy} busyLabel="Exporting…">
          <SwapLabel swapped={downloaded.swapped} done="Downloaded">Download</SwapLabel>
        </Button>
        <Button variant="ghost" onClick={copy} disabled={working}
          aria-label="Copy graph for Word or PowerPoint"
          title="Copy the graph as a picture (PNG, and SVG where the browser allows) to paste into Word or PowerPoint">
          <SwapLabel swapped={copied.swapped} done="Copied">Copy</SwapLabel>
        </Button>
        {/* Options: a popover in the top layer (the graph card clips its
            overflow), below the button or above it, whichever has room. */}
        <Popover open={open} onOpenChange={setOpen}>
          <Popover.Trigger variant="ghost">Options</Popover.Trigger>
          <Popover.Content className="export-pop" aria-label="Export options"
            side="bottom" align="end" collisionPadding={belowStickyHeader}>
            <fieldset className="field-radios export-fieldset">
              <legend>Size unit</legend>
              {(["px", "mm", "in"] as const).map((u) => (
                <label key={u}>
                  <input type="radio" name="export-unit" checked={s.unit === u}
                    onChange={() => { const n = { ...eff, unit: u }; setSettings(n); resync(n); }} />
                  {u === "px" ? "Pixels (96 per inch)" : u === "mm" ? "Millimetres" : "Inches"}
                </label>
              ))}
            </fieldset>
            <fieldset className="export-fieldset">
              <legend>Journal figure width</legend>
              <div className="export-presets">
                {JOURNAL_PRESETS.map((p) => (
                  <Button key={p.id} size="sm" title={`Typical: ${p.note}`}
                    onClick={() => { const n = applyPreset(eff, p, eff.dpi >= 600 ? 600 : 300);
                      setSettings(n); resync(n); }}>
                    {p.label} <span className="export-sub">{p.widthMm} mm</span>
                  </Button>
                ))}
              </div>
              <div className="export-presets" role="group" aria-label="Resolution">
                {DPI_CHOICES.map((d) => (
                  <Button key={d} size="sm" aria-pressed={eff.dpi === d}
                    onClick={() => { setDpi(String(d)); commit({ dpi: d }); }}>
                    {d} dpi
                  </Button>
                ))}
              </div>
              <p className="hint-block">
                Journals usually ask for 300 dpi (photos, colour) or 600 dpi
                (line art) at the printed width. Check your journal&apos;s guide.
              </p>
            </fieldset>
            <div className="export-checks">
              <label className="check-row">
                <input type="checkbox" checked={s.scaleText}
                  onChange={(e) => commit({ scaleText: e.target.checked })} />
                <span>Scale the graph as shown (text grows or shrinks with it)</span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={s.transparent && supportsTransparency(s.format)}
                  disabled={!supportsTransparency(s.format)}
                  onChange={(e) => commit({ transparent: e.target.checked })} />
                <span>
                  Transparent background
                  {!supportsTransparency(s.format) && (
                    <span className="export-sub"> (not in {s.format.toUpperCase()})</span>
                  )}
                </span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={s.paper}
                  onChange={(e) => commit({ paper: e.target.checked })} />
                <span>Print colours in dark theme</span>
              </label>
            </div>
            <div className="export-all">
              {eff.format === "pdf" && (
                <label className="check-row">
                  <input type="checkbox" checked={onePdf}
                    onChange={(e) => setOnePdf(e.target.checked)} />
                  <span>One PDF, a page per graph</span>
                </label>
              )}
              <Button onClick={exportAll} disabled={busy || !graphCount} busy={batch.busy}
                busyLabel={`Exporting ${batch.progress}…`}>
                {`Export all ${graphCount} graph${graphCount === 1 ? "" : "s"} as `
                  + (eff.format === "pdf" && onePdf ? "one PDF" : `${s.format.toUpperCase()} (zip)`)}
              </Button>
            </div>
            <div className="export-all">
              <Button disabled={working || !graphCount}
                onClick={() => { setOpen(false); openPptxExport(graphId ?? null,
                  graphId ? { kind: "graph", graphId } : { kind: "all" }); }}>
                Export to PowerPoint (.pptx)…
              </Button>
              <p className="hint-block">One slide per graph. {PPTX_EDIT_HINT}</p>
            </div>
            <details className="export-help">
              <summary>About the formats</summary>
              <p>
                SVG and PDF are vector files: lines and text stay sharp at
                any size, and PDF text stays text. PNG, TIFF, JPEG and WebP
                are pixels; their sharpness is set by the DPI. TIFF and
                JPEG have no transparency, so semitransparent colours are
                flattened onto white there; PNG, WebP, SVG and PDF keep it.
              </p>
              <p>
                EPS is not offered: modern journal systems and vector
                editors accept PDF or SVG instead. In PDFs, the standard
                fonts used cannot show every symbol, so a few (the minus
                sign, Greek letters) are written as their closest
                equivalent; use SVG when that matters.
              </p>
            </details>
          </Popover.Content>
        </Popover>
      </div>
      <div className="export-fields" role="group" aria-label="Export graph">
        <span className="export-title" aria-hidden="true">Export</span>
        <select value={s.format} aria-label="Export format"
          onChange={(e) => setFormat(e.target.value as ExportFormat)}>
          {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <NumberField label="Width" unit={s.unit} value={width} onValueChange={setWidth}
          fieldClassName="export-num" />
        <NumberField label="Height" unit={s.unit} value={height} onValueChange={setHeight}
          fieldClassName="export-num" />
        {!vector && (
          <NumberField label="DPI" aria-label="Resolution (DPI)" integer value={dpi}
            onValueChange={setDpi} fieldClassName="export-num" />
        )}
      </div>
      <div className="export-notes">
        <span className="export-hint">
          {vector ? physicalLabel(eff.width, eff.height)
            : `${px.w} × ${px.h} px, ${(px.w / eff.dpi).toFixed(1)} × ${(px.h / eff.dpi).toFixed(1)} in`}
        </span>
        {belowFontFloor(minPt) && (
          <span className="export-warn" role="status">
            Smallest text prints at {minPt} pt; journals usually want at least {FONT_FLOOR_PT} pt.
          </span>
        )}
        {note && <span className="export-note" role="status">{note}</span>}
      </div>
      {batch.host}
    </div>
  );
}
