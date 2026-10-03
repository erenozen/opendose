import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useProject } from "../app/context";
import { useBatchExport } from "../export/BatchExport";
import { copyPng, saveBlob } from "../export/download";
import { graphBlob, graphPngBlob, graphSmallestPt } from "../export/graph";
import {
  applyPreset, belowFontFloor, DPI_CHOICES, EXTENSIONS, FONT_FLOOR_PT, FORMATS, fileStem,
  fromUnit, isVector, JOURNAL_PRESETS, physicalLabel, rasterSize, supportsTransparency,
  toUnit, tooLarge,
} from "../export/settings";
import { useExportSettings } from "../export/useExportSettings";
import type { SchemeId } from "../lib/palette";
import type { ExportFormat, ExportPrefs } from "../project/types";

/**
 * Export strip under a graph: format, size, resolution, Download and
 * Copy, plus an Options popover (units, journal sizes, background, colour
 * handling, export of every graph at once). The last settings are kept
 * with the project.
 */
export default function ExportPanel({
  filename = "opendose-graph", leading, scheme,
}: {
  /** File name without extension (normally from the sheet name). */
  filename?: string;
  /** Rendered at the start of the strip, so graph controls share one row. */
  leading?: ReactNode;
  /** The graph's colour scheme, for mapping dark-theme colours to print. */
  scheme?: SchemeId;
}) {
  const { project } = useProject();
  const [settings, setSettings] = useExportSettings();
  const s = settings;
  const [width, setWidth] = useState(() => String(toUnit(s.width, s.unit)));
  const [height, setHeight] = useState(() => String(toUnit(s.height, s.unit)));
  const [dpi, setDpi] = useState(() => String(s.dpi));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [onePdf, setOnePdf] = useState(true);
  const [minPt, setMinPt] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optsRef = useRef<HTMLSpanElement>(null);
  const optsBtn = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const batch = useBatchExport();

  // Effective settings: what is typed now, falling back to the stored values.
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
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

  // Options popover: drawn in a portal with fixed positioning (the graph
  // card clips its overflow), opening down or up, whichever has room.
  const [pos, setPos] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = optsBtn.current?.getBoundingClientRect();
      if (!r) return;
      const top = 72; // keep clear of the sticky header
      const below = window.innerHeight - r.bottom - 16;
      const above = r.top - top - 8;
      const right = Math.max(8, window.innerWidth - r.right);
      setPos(below >= 360 || below >= above
        ? { top: r.bottom + 8, right, maxHeight: below }
        : { bottom: window.innerHeight - r.top + 8, right, maxHeight: above });
    };
    place();
    requestAnimationFrame(() => popRef.current
      ?.querySelector<HTMLElement>("input:not(:disabled), button")?.focus());
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Escape / outside click close it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!optsRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      optsBtn.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const download = async () => {
    const gd = target();
    if (!gd) return;
    setErr("");
    setNote("");
    if (!vector && tooLarge(px.w, px.h)) {
      setErr(`${px.w} × ${px.h} px is too large to render. Lower the DPI or the size.`);
      return;
    }
    setSettings(eff);
    setBusy(true);
    try {
      const blob = await graphBlob(gd, eff, scheme);
      saveBlob(blob, `${filename}.${EXTENSIONS[eff.format]}`);
    } catch {
      setErr("Could not export the graph at that size. Try a smaller one.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const gd = target();
    if (!gd) return;
    setErr("");
    setNote("");
    const png = { ...eff, format: "png" as const };
    const size = rasterSize(png.width, png.height, png.dpi);
    if (tooLarge(size.w, size.h)) {
      setErr("Too large to copy. Lower the DPI or the size.");
      return;
    }
    const outcome = await copyPng(() => graphPngBlob(gd, png, scheme));
    if (outcome === "copied") setNote("Copied as PNG.");
    else {
      // No image clipboard here (or permission refused): download instead.
      try {
        saveBlob(await graphPngBlob(gd, png, scheme), `${filename}.png`);
        setNote("This browser cannot copy images, so the PNG was downloaded instead.");
      } catch {
        setErr("Could not copy the graph.");
      }
    }
  };

  const exportAll = async () => {
    const ids = project.sheets.filter((x) => x.kind === "graph").map((x) => x.id);
    if (!ids.length) return;
    setErr("");
    setNote("");
    setSettings(eff);
    const msg = await batch.run(ids, eff, `${fileStem(project.title, "opendose")}-graphs`,
      eff.format === "pdf" && onePdf);
    setNote(msg);
  };

  const setFormat = (f: ExportFormat) => { setErr(""); commit({ format: f }); };
  const unitLabel = s.unit;
  const graphCount = project.sheets.filter((x) => x.kind === "graph").length;

  return (
    <div className="export-panel" ref={panelRef}>
      {leading}
      <span className="export-title">Export graph</span>
      <label>
        <select value={s.format} aria-label="Export format"
          onChange={(e) => setFormat(e.target.value as ExportFormat)}>
          {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <label>W
        <input inputMode="decimal" value={width} aria-label={`Width (${unitLabel})`}
          onChange={(e) => setWidth(e.target.value)} />
      </label>
      <label>H
        <input inputMode="decimal" value={height} aria-label={`Height (${unitLabel})`}
          onChange={(e) => setHeight(e.target.value)} />
      </label>
      {unitLabel !== "px" && <span className="export-unit">{unitLabel}</span>}
      {!vector && (
        <label>DPI
          <input inputMode="numeric" value={dpi} aria-label="Resolution (dots per inch)"
            onChange={(e) => setDpi(e.target.value)} />
        </label>
      )}
      <button className="export-btn" onClick={download} disabled={busy || batch.busy}>
        <span className="swap-label" key={busy ? "busy" : "idle"}>
          {busy ? "Exporting…" : "Download"}
        </span>
      </button>
      <button type="button" onClick={copy} disabled={busy || batch.busy}
        aria-label="Copy image to clipboard" title="Copy as PNG to the clipboard">
        Copy
      </button>
      <span className="export-opts" ref={optsRef}>
        <button type="button" ref={optsBtn} className="settings-btn" aria-haspopup="dialog"
          aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Options
        </button>
        {open && createPortal(
          <div className="export-pop" role="dialog" aria-label="Export options" ref={popRef}
            style={pos}>
            <fieldset className="export-fieldset">
              <legend>Size unit</legend>
              {(["px", "mm", "in"] as const).map((u) => (
                <label key={u} className="check-row">
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
                  <button key={p.id} type="button" title={`Typical: ${p.note}`}
                    onClick={() => { const n = applyPreset(eff, p, eff.dpi >= 600 ? 600 : 300);
                      setSettings(n); resync(n); }}>
                    {p.label} <span className="export-sub">{p.widthMm} mm</span>
                  </button>
                ))}
              </div>
              <div className="export-presets" role="group" aria-label="Resolution">
                {DPI_CHOICES.map((d) => (
                  <button key={d} type="button" aria-pressed={eff.dpi === d}
                    onClick={() => { setDpi(String(d)); commit({ dpi: d }); }}>
                    {d} dpi
                  </button>
                ))}
              </div>
              <p className="hint-block">
                Journals usually ask for 300 dpi (photos, colour) or 600 dpi
                (line art) at the printed width. Check your journal&apos;s guide.
              </p>
            </fieldset>
            <label className="check-row">
              <input type="checkbox" checked={s.scaleText}
                onChange={(e) => commit({ scaleText: e.target.checked })} />
              Scale the graph as shown (text grows or shrinks with it)
            </label>
            <label className="check-row">
              <input type="checkbox" checked={s.transparent && supportsTransparency(s.format)}
                disabled={!supportsTransparency(s.format)}
                onChange={(e) => commit({ transparent: e.target.checked })} />
              Transparent background
              {!supportsTransparency(s.format) && (
                <span className="export-sub">(not in {s.format.toUpperCase()})</span>
              )}
            </label>
            <label className="check-row">
              <input type="checkbox" checked={s.paper}
                onChange={(e) => commit({ paper: e.target.checked })} />
              Print colours in dark theme
            </label>
            <div className="export-all">
              {eff.format === "pdf" && (
                <label className="check-row">
                  <input type="checkbox" checked={onePdf}
                    onChange={(e) => setOnePdf(e.target.checked)} />
                  One PDF, a page per graph
                </label>
              )}
              <button type="button" onClick={exportAll}
                disabled={batch.busy || busy || !graphCount}>
                {batch.busy ? `Exporting ${batch.progress}…`
                  : `Export all ${graphCount} graph${graphCount === 1 ? "" : "s"} as `
                    + (eff.format === "pdf" && onePdf ? "one PDF" : `${s.format.toUpperCase()} (zip)`)}
              </button>
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
          </div>, document.body)}
      </span>
      {!err && (
        <span className="export-hint">
          {vector ? physicalLabel(eff.width, eff.height)
            : `${px.w} × ${px.h} px, ${(px.w / eff.dpi).toFixed(1)} × ${(px.h / eff.dpi).toFixed(1)} in`}
        </span>
      )}
      {belowFontFloor(minPt) && (
        <span className="export-warn" role="status">
          Smallest text prints at {minPt} pt; journals usually want at least {FONT_FLOOR_PT} pt.
        </span>
      )}
      {note && <span className="export-note" role="status">{note}</span>}
      {err && <span className="export-err" role="alert">{err}</span>}
      {batch.host}
    </div>
  );
}
