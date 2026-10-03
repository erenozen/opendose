import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCommands } from "../app/commands";
import { useProject } from "../app/context";
import { saveBlob } from "../export/download";
import { exportFigure, figureToSvg, waitForPlot } from "../export/figure";
import {
  belowFontFloor, DPI_CHOICES, EXTENSIONS, FONT_FLOOR_PT, FORMATS, fileStem,
} from "../export/settings";
import { useExportSettings } from "../export/useExportSettings";
import LayoutCanvas from "../layout/LayoutCanvas";
import LayoutInspector from "../layout/LayoutInspector";
import { exportPage, pagePixels, pageSmallestPt, pageTooLarge } from "../layout/pageExport";
import { useMasterLegend } from "../layout/useMasterLegend";
import { CHROME_DARK, CHROME_LIGHT, isDarkMode, onThemeChange } from "../lib/palette";
import { newId } from "../project/ids";
import {
  applyGrid, contentRect, fillPlaceholders, freeSpot, GRID_PRESETS, pageDims, projectGraphIds,
  PX_PER_MM, resolveLayout, storeLayout, type ResolvedLayout,
} from "../project/layout";
import { updateSheet } from "../project/ops";
import type {
  ExportFormat, GraphSheet, LayoutItem, LayoutRect, LayoutSheet, Sheet,
} from "../project/types";
import { SnowflakeIcon } from "./SheetIcon";

type Zoom = "fit" | number;

/**
 * Page layout composer: arrange graphs (live, drawn by their own plot
 * panels), unlinked pictures, text and a master legend on a page, then
 * export or print the page as a whole.
 */
export default function LayoutSheetView({ sheet }: { sheet: LayoutSheet }) {
  const { project, apply, engineReady } = useProject();
  const cmd = useCommands();
  const layout = resolveLayout(sheet);
  const readOnly = !!sheet.frozen;
  const [selected, setSelected] = useState<string | null>(null);
  const [zoomPref, setZoomPref] = useState<Zoom>("fit");
  const [fitZoom, setFitZoom] = useState(0.6);
  const [rows, setRows] = useState(String(layout.grid.rows));
  const [cols, setCols] = useState(String(layout.grid.cols));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [minPt, setMinPt] = useState<number | null>(null);
  const [dark, setDark] = useState(isDarkMode());
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLSelectElement>(null);
  const [settings, setSettings] = useExportSettings();
  const [dpi, setDpi] = useState(String(settings.dpi));

  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);
  const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
  const hasLegend = layout.items.some((i) => i.kind === "legend");
  const legend = useMasterLegend(pageRef, layout.items, hasLegend);
  const dims = pageDims(layout.page);
  const pageW = dims.w * PX_PER_MM;
  const pageH = dims.h * PX_PER_MM;

  // Fit the whole page into the visible area (width, and the height left
  // below the toolbar; on narrow screens only the width counts).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const byW = (el.clientWidth - 32) / pageW;
      const room = window.innerHeight - el.getBoundingClientRect().top + window.scrollY - 56;
      const byH = window.matchMedia("(max-width: 1100px)").matches ? byW : room / pageH;
      setFitZoom(Math.min(1.5, Math.max(0.2, Math.min(byW, byH))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [pageW, pageH]);
  const zoom = zoomPref === "fit" ? fitZoom : zoomPref;

  // Printing a layout prints its page at its own paper size.
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.layoutPrint = "true";
    style.textContent = `@media print { @page { size: ${dims.w}mm ${dims.h}mm; margin: 0; } }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [dims.w, dims.h]);

  // Selection must point at an existing item (undo can remove it).
  useEffect(() => {
    if (selected && !layout.items.some((i) => i.id === selected)) setSelected(null);
  }, [selected, layout.items]);

  const edit = (fn: (l: ResolvedLayout) => ResolvedLayout, key: string | null = null) =>
    apply((p) => updateSheet<Sheet>(p, sheet.id, (s) => (s.kind === "layout" && !s.frozen
      ? storeLayout(s, fn(resolveLayout(s))) : s)), key ? `layout:${sheet.id}:${key}` : null);
  const editItem = (id: string, patch: Partial<LayoutItem>, key: string | null = null) =>
    edit((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, ...patch } as LayoutItem : i)) }),
      key);
  const setRect = (id: string, r: LayoutRect, key: string | null) => editItem(id, r, key);
  const remove = (id: string) => {
    edit((l) => ({ ...l, items: l.items.filter((i) => i.id !== id) }));
    setSelected(null);
  };

  const add = (kind: LayoutItem["kind"]) => {
    const c = contentRect(layout.page);
    const id = newId();
    const size = kind === "text" ? { w: c.w, h: 12 }
      : kind === "legend" ? { w: c.w, h: 14 } : { w: Math.min(87, c.w), h: 70 };
    const base = { id, ...freeSpot(layout.page, layout.items, size.w, size.h) };
    const item: LayoutItem = kind === "text"
      ? { ...base, kind, text: "", fontSize: 10, bold: false, align: "left" }
      : kind === "legend"
        ? { ...base, kind, fontSize: 9, columns: 3 }
        : { ...base, kind: "graph", graphId: null };
    edit((l) => ({ ...l, items: [...l.items, item] }));
    setSelected(id);
    requestAnimationFrame(() => pageRef.current
      ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)?.focus());
  };

  const arrange = (r: number, c: number) => {
    setRows(String(r));
    setCols(String(c));
    edit((l) => applyGrid(l, r, c, newId));
  };

  const fill = (start: string | null) => {
    const before = layout;
    const after = fillPlaceholders(before, projectGraphIds(project), start);
    if (after === before) {
      setMsg({ text: before.items.some((i) => i.kind === "graph" && !i.graphId)
        ? "Every graph is already on this page." : "No empty placeholders: add one or pick an arrangement." });
      return;
    }
    setMsg(null);
    edit(() => after);
  };

  // Replace a live graph by a static SVG copy of it (an unlinked picture).
  const unlink = async (id: string) => {
    const it = layout.items.find((i) => i.id === id);
    if (!it || it.kind !== "graph" || !it.graphId) return;
    const graph = project.sheets.find((s): s is GraphSheet => s.id === it.graphId && s.kind === "graph");
    const host = pageRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
    const gd = host ? await waitForPlot(host, 5000) : null;
    if (!gd || !graph) { setMsg({ text: "The graph has not been drawn yet.", error: true }); return; }
    const fig = exportFigure(gd, { transparent: true, paper: true, scheme: graph.settings.scheme });
    if (it.hideLegend) fig.layout = { ...fig.layout, showlegend: false };
    const svg = await figureToSvg(fig, it.w * PX_PER_MM, it.h * PX_PER_MM);
    edit((l) => ({ ...l, items: l.items.map((i) => (i.id === id
      ? { id, kind: "picture", name: graph.name, svg, x: i.x, y: i.y, w: i.w, h: i.h } : i)) }));
  };

  const format = settings.format;
  const vector = format === "svg" || format === "pdf";
  const effDpi = Math.min(Math.max(Number(dpi) || settings.dpi, 36), 2400);
  const opts = { format, dpi: effDpi, paper: settings.paper };
  const px = pagePixels(layout, effDpi);

  useEffect(() => {
    const t = setTimeout(() => {
      if (pageRef.current) setMinPt(pageSmallestPt(pageRef.current, layout));
    }, 600);
    return () => clearTimeout(t);
  }, [sheet, project]); // eslint-disable-line react-hooks/exhaustive-deps

  const doExport = async () => {
    const el = pageRef.current;
    if (!el) return;
    setMsg(null);
    if (pageTooLarge(layout, opts)) {
      setMsg({ text: `${px.w} × ${px.h} px is too large to render. Lower the DPI.`, error: true });
      return;
    }
    setSettings({ ...settings, dpi: effDpi });
    setBusy(true);
    try {
      const blob = await exportPage(el, layout, project, legend, opts);
      saveBlob(blob, `${fileStem(sheet.name, "layout")}.${EXTENSIONS[format]}`);
    } catch {
      setMsg({ text: "Could not export the page. Try another format or a lower DPI.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const print = () => { setSelected(null); requestAnimationFrame(() => window.print()); };

  const sel = layout.items.find((i) => i.id === selected) ?? null;
  const graphCount = project.sheets.filter((s) => s.kind === "graph").length;

  return (
    <main className="layout-main">
      <div className="layout-toolbar" role="toolbar" aria-label="Layout tools">
        <h2 className="layout-title">{sheet.name}</h2>
        {readOnly && (
          <span className="frozen-chip"><SnowflakeIcon /> Frozen</span>
        )}
        <div className="layout-group" role="group" aria-label="Arrangement">
          {GRID_PRESETS.map((g) => (
            <button key={`${g.rows}x${g.cols}`} type="button" className="grid-preset"
              disabled={readOnly}
              aria-label={`Arrange as ${g.rows} row${g.rows > 1 ? "s" : ""} by ${g.cols} column${g.cols > 1 ? "s" : ""}`}
              aria-pressed={layout.grid.rows === g.rows && layout.grid.cols === g.cols}
              title={`${g.rows} × ${g.cols}`}
              onClick={() => arrange(g.rows, g.cols)}>
              <GridIcon rows={g.rows} cols={g.cols} />
            </button>
          ))}
          <label className="mini-field">
            <span className="sr-only">Rows</span>
            <input inputMode="numeric" value={rows} aria-label="Rows" disabled={readOnly}
              onChange={(e) => setRows(e.target.value)} />
          </label>
          <span aria-hidden="true">×</span>
          <label className="mini-field">
            <span className="sr-only">Columns</span>
            <input inputMode="numeric" value={cols} aria-label="Columns" disabled={readOnly}
              onChange={(e) => setCols(e.target.value)} />
          </label>
          <button type="button" disabled={readOnly} onClick={() => {
            const r = Math.round(Number(rows));
            const c = Math.round(Number(cols));
            if (r >= 1 && r <= 8 && c >= 1 && c <= 8) arrange(r, c);
            else setMsg({ text: "Rows and columns: 1 to 8.", error: true });
          }}>Arrange</button>
        </div>
        <div className="layout-group" role="group" aria-label="Add to page">
          <button type="button" disabled={readOnly} onClick={() => add("graph")}>+ Placeholder</button>
          <button type="button" disabled={readOnly} onClick={() => add("text")}>+ Text</button>
          <button type="button" disabled={readOnly || hasLegend} onClick={() => add("legend")}>
            + Master legend
          </button>
          <button type="button" disabled={readOnly || !graphCount} onClick={() => fill(null)}>
            Fill with graphs
          </button>
        </div>
        <div className="layout-group" role="group" aria-label="Sheet">
          <button type="button" onClick={() => cmd.duplicate(sheet.id)}>Duplicate layout</button>
          <button type="button" onClick={print}>Print</button>
          <label className="mini-field">
            <span>Zoom</span>
            <select value={String(zoomPref)} aria-label="Zoom"
              onChange={(e) => setZoomPref(e.target.value === "fit" ? "fit" : Number(e.target.value))}>
              <option value="fit">Fit</option>
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.5">150%</option>
            </select>
          </label>
        </div>
        <div className="layout-group layout-export" role="group" aria-label="Export page">
          <select value={format} aria-label="Page export format"
            onChange={(e) => setSettings({ ...settings, format: e.target.value as ExportFormat })}>
            {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          {!vector && (
            <label className="mini-field">
              <span>DPI</span>
              <input inputMode="numeric" value={dpi} list="layout-dpi"
                aria-label="Page export resolution (DPI)" onChange={(e) => setDpi(e.target.value)} />
              <datalist id="layout-dpi">
                {DPI_CHOICES.map((d) => <option key={d} value={d} />)}
              </datalist>
            </label>
          )}
          <button type="button" className="btn-primary" onClick={doExport}
            disabled={busy || !engineReady}>
            {busy ? "Exporting…" : "Export page"}
          </button>
          <span className="export-hint">
            {vector ? `${Math.round(dims.w)} × ${Math.round(dims.h)} mm`
              : `${px.w} × ${px.h} px`}
          </span>
        </div>
      </div>
      {(msg || belowFontFloor(minPt) || dark) && (
        <div className="layout-notes">
          {msg && (
            <span className={msg.error ? "export-err" : "export-note"}
              role={msg.error ? "alert" : "status"}>{msg.text}</span>
          )}
          {belowFontFloor(minPt) && (
            <span className="export-warn" role="status">
              Smallest text on the page is {minPt} pt; journals usually want at least {FONT_FLOOR_PT} pt.
            </span>
          )}
          {dark && settings.paper && (
            <span className="export-note">Shown in dark-theme colours; exports and prints use print colours.</span>
          )}
        </div>
      )}
      <div className="layout-body">
        <div className="layout-scroll" ref={scrollRef}>
          <LayoutCanvas layout={layout} project={project} readOnly={readOnly} zoom={zoom}
            ink={chrome.ink} surface={chrome.surface} selected={selected}
            onSelect={setSelected} onRect={setRect} onRemove={remove}
            onChooseGraph={(id) => {
              setSelected(id);
              requestAnimationFrame(() => pickerRef.current?.focus());
            }}
            legend={legend} pageRef={pageRef} />
        </div>
        <LayoutInspector layout={layout} project={project} readOnly={readOnly} selected={sel}
          edit={edit} editItem={editItem} onRemove={remove} onUnlink={(id) => void unlink(id)}
          onFill={fill} pickerRef={pickerRef} />
      </div>
    </main>
  );
}

function GridIcon({ rows, cols }: { rows: number; cols: number }) {
  const W = 18;
  const H = 18;
  const gap = 2;
  const cw = (W - gap * (cols - 1)) / cols;
  const ch = (H - gap * (rows - 1)) / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(<rect key={`${r}-${c}`} x={c * (cw + gap)} y={r * (ch + gap)} width={cw}
        height={ch} rx="1.5" />);
    }
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.3">{cells}</svg>
  );
}
