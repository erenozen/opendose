import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../../app/context";
// factory -> registry -> this grid is a module cycle; addFamily is only
// called from an event handler, never while modules evaluate.
import { addFamily } from "../../app/factory";
import { toDelimited } from "../../project/exportTable";
import { newId } from "../../project/ids";
import { pasteNeedsImport } from "../../project/importText";
import {
  addDataset, addRow, allowsSummaryFormat, blockValues, clearBlock, deleteDataset,
  deleteRow, deleteRows, flatColumns, insertDataset, insertRows, insertSeries,
  isExcluded, moveDataset, normRect, parseCell, parseClipboardGrid, pasteBlock,
  renameDataset, reverseRows, setCell, setRowTitle, setSubTitle, setSubcolumnCount,
  setVarType, setX, sortRows, tableShape, toggleBlockExcluded, toggleExcluded,
  type CellRect, type CellRef, type SortKey,
} from "../../project/table";
import {
  SUBCOLUMN_FORMAT_LABELS, type DataColumn, type DataTableModel, type TableType,
  type VarType,
} from "../../project/types";
import { xDisplay, xInvalid } from "../../project/xformat";
import type { EditorProps } from "../types";
import DataInspector from "./DataInspector";
import { columnLabel } from "./convert";
import {
  ConvertDialog, ExportDialog, SeriesDialog, SortDialog, TableFormatDialog,
} from "./EditDialogs";
import ImportDialog, { type ImportRequest } from "./ImportDialog";
import MenuButton from "./MenuButton";
import { lazy, Suspense } from "react";

// Wide <-> long (src/share), loaded when first opened.
const ReshapeDialog = lazy(() => import("../../share/ReshapeDialog"));
import "./grid.css";

// Default subcolumn header when the user has not titled it.
function subLabel(type: TableType, di: number, s: number): string {
  if (type === "nested") return `${String.fromCharCode(65 + (di % 26))}${s + 1}`;
  if (type === "survival") return ["Time", "Event"][s] ?? `Covariate ${s - 1}`;
  return `Y${s + 1}`;
}

const HINTS: Partial<Record<TableType, string>> = {
  xy: "Paste directly from Excel; tab-separated blocks expand automatically.",
  column: "Each column is one group; enter values down the rows (row titles optional). Paste from Excel works.",
  grouped: "Rows are levels of one factor (title them on the left); columns are levels of the other, with replicates side by side.",
  contingency: "Enter counts (not percentages).",
  survival: "One row per subject: Time, then Event (1 = event, 0 = censored).",
  partsofwhole: "Each row is one part of the whole; title it on the left.",
  multivariable: "One row per observation, one column per variable. Mark each variable continuous or categorical.",
  nested: "Each column is a group; its subcolumns are subgroups (e.g. one per animal), with replicate values down the rows.",
};

type Dialog =
  | { kind: "import"; req?: ImportRequest; paste?: { text: string; r: number; c: number } }
  | { kind: "export" } | { kind: "sort" } | { kind: "series" } | { kind: "format" }
  | { kind: "convert" } | { kind: "reshape" };

const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";

/**
 * Generic editor for every table type. Layout, left to right: row number,
 * row titles (column / grouped / contingency / parts of whole), X (XY),
 * then each dataset's subcolumns. Keyboard: arrows move between cells
 * (left/right once the caret reaches the edge), Enter / Shift+Enter move
 * down / up, Shift+arrows (or a mouse drag, or Shift+click) select a
 * block; on a block Delete clears, Ctrl/Cmd+C / X copy / cut it as
 * tab-separated text and Ctrl/Cmd+E excludes or includes it. Ctrl/Cmd+V
 * pastes at the cursor. Ctrl/Cmd+Shift+Enter inserts a row below.
 * The toolbar imports, exports, sorts, inserts series and rows /
 * columns, and formats the table; the Data Inspector under the grid
 * summarizes the selection.
 */
export default function DataGrid({ sheet, table, readOnly, onChange }: EditorProps) {
  const t = table;
  const shape = tableShape(t.type);
  const nRows = t.x.length;
  const wrap = useRef<HTMLDivElement>(null);
  const subCount = (d: DataColumn) => d.rows[0]?.length ?? 1;
  const numeric = t.type !== "multivariable";
  const showSubhead = shape.hasSubcolumns || t.type === "survival"
    || t.type === "multivariable";
  const api = useProject();

  const cols = useMemo(() => flatColumns(t), [t]);
  const flat = cols.length;
  const rowTitleCol = shape.hasRowTitles ? 0 : -1;
  const xCol = cols.findIndex((c) => c.kind === "x");
  const dsBase = t.datasets.map((_, d) => cols.findIndex((c) => c.kind === "y" && c.dataset === d));

  // Selection: (r0, c0) is the anchor, the cell holding keyboard focus;
  // (r1, c1) is the far corner moved by Shift+arrows / dragging.
  // (kept per sheet: switching tables starts without a selection)
  const [selState, setSelState] = useState<{ id: string; rect: CellRect } | null>(null);
  const selRaw = selState?.id === sheet.id ? selState.rect : null;
  const setSel = (rect: CellRect | null) => setSelState(rect ? { id: sheet.id, rect } : null);
  const sel = selRaw && {
    r0: Math.min(selRaw.r0, nRows - 1), r1: Math.min(selRaw.r1, nRows - 1),
    c0: Math.min(selRaw.c0, flat - 1), c1: Math.min(selRaw.c1, flat - 1),
  };
  const rect = sel ? normRect(sel) : null;
  const multi = !!sel && (sel.r0 !== sel.r1 || sel.c0 !== sel.c1);
  const inSel = (r: number, c: number) => multi && !!rect
    && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
  const [editing, setEditing] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [selecting, setSelecting] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    const up = () => { dragging.current = false; setSelecting(false); };
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, []);

  const refAt = (r: number, c: number): CellRef | null => {
    const col = cols[c];
    if (!col || col.kind === "rowTitle") return null;
    return col.kind === "x" ? { kind: "x", row: r }
      : { kind: "y", dataset: col.dataset, row: r, sub: col.sub };
  };

  const focusCell = (r: number, c: number) => {
    const el = wrap.current?.querySelector<HTMLInputElement>(
      `input[data-r="${r}"][data-c="${c}"]`);
    if (el) { el.focus(); el.select(); }
  };

  const key = (what: string) => `${sheet.id}:${what}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    const mod = e.ctrlKey || e.metaKey;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length
      && el.selectionEnd === el.value.length;
    if (mod && e.key.toLowerCase() === "e") {
      e.preventDefault();
      if (readOnly) return;
      if (multi && rect) { onChange((x) => toggleBlockExcluded(x, rect)); return; }
      const ref = refAt(r, c);
      if (ref) onChange((x) => toggleExcluded(x, ref));
      return;
    }
    if (mod && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      if (!readOnly) {
        onChange((x) => insertRows(x, r + 1, 1));
        requestAnimationFrame(() => focusCell(r + 1, c));
      }
      return;
    }
    if (multi && rect && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      if (!readOnly) onChange((x) => clearBlock(x, rect));
      return;
    }
    if (multi && e.key === "Escape") {
      e.preventDefault();
      setSel({ r0: r, c0: c, r1: r, c1: c });
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    if (e.shiftKey && arrows[e.key]) {
      e.preventDefault();
      const [dr, dc] = arrows[e.key];
      const base = sel ?? { r0: r, c0: c, r1: r, c1: c };
      setSel({
        ...base,
        r1: Math.max(0, Math.min(nRows - 1, base.r1 + dr)),
        c1: Math.max(0, Math.min(flat - 1, base.c1 + dc)),
      });
      return;
    }
    let target: [number, number] | null = null;
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) target = [r + 1, c];
    else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) target = [r - 1, c];
    else if (e.key === "ArrowLeft" && (atStart || el.readOnly || multi)) target = [r, c - 1];
    else if (e.key === "ArrowRight" && (atEnd || el.readOnly || multi)) target = [r, c + 1];
    if (!target) return;
    const [tr, tc] = target;
    if (tr < 0 || tr >= nRows || tc < 0 || tc >= flat) return;
    e.preventDefault();
    setSel({ r0: tr, c0: tc, r1: tr, c1: tc });
    focusCell(tr, tc);
  };

  const onPaste = (e: React.ClipboardEvent, r: number, c: number) => {
    if (readOnly) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // single value
    e.preventDefault();
    const [pr, pc] = multi && rect ? [rect.r0, rect.c0] : [r, c];
    if (pasteNeedsImport(text)) {
      setDialog({ kind: "import", req: { text, mode: "insert", row: pr, col: pc },
        paste: { text, r: pr, c: pc } });
      return;
    }
    const block = parseClipboardGrid(text);
    onChange((x) => pasteBlock(x, pr, pc, block));
  };

  const onCopy = (e: React.ClipboardEvent, cut: boolean) => {
    if (!multi || !rect) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", toDelimited(blockValues(t, rect), "tsv"));
    if (cut && !readOnly) onChange((x) => clearBlock(x, rect));
  };

  const onCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    if (e.button !== 0) return;
    if (e.shiftKey && sel) {
      e.preventDefault(); // keep focus (the anchor) where it is
      setSel({ ...sel, r1: r, c1: c });
      return;
    }
    dragging.current = e.pointerType === "mouse";
    setSel({ r0: r, c0: c, r1: r, c1: c });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !(e.buttons & 1) || !sel) return;
    const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
      ?.closest<HTMLElement>("[data-r][data-c]");
    if (!hit || !wrap.current?.contains(hit)) return;
    const r = Number(hit.dataset.r);
    const c = Number(hit.dataset.c);
    if (r === sel.r1 && c === sel.c1) return;
    if (r !== sel.r0 || c !== sel.c0) {
      setSelecting(true);
      window.getSelection()?.removeAllRanges();
    }
    setSel({ ...sel, r1: r, c1: c });
  };

  const onCellFocus = (r: number, c: number) => {
    setEditing(`${r}:${c}`);
    if (!sel || sel.r0 !== r || sel.c0 !== c) setSel({ r0: r, c0: c, r1: r, c1: c });
  };

  // Display: decimals and date / time formatting apply while a cell is
  // not being edited; the cell under the cursor shows what was typed.
  const decimalsOk = t.decimals !== undefined && t.type !== "contingency"
    && t.type !== "survival";
  const shown = (r: number, c: number, raw: string, isX: boolean, num: boolean) => {
    if (editing === `${r}:${c}` || !raw.trim()) return raw;
    if (isX && t.xFormat !== "numbers") return xDisplay(t, raw);
    if (num && decimalsOk) {
      const v = parseCell(raw);
      if (v !== null) return v.toFixed(t.decimals);
    }
    return raw;
  };

  const cellInput = (r: number, c: number, value: string,
    set: (v: string) => void,
    opts: { excluded?: boolean; text?: boolean; label: string; isX?: boolean; invalid?: boolean }) => (
      <input
        data-r={r} data-c={c}
        inputMode={opts.text ? "text" : "decimal"}
        className={opts.text ? "text-cell" : undefined}
        value={shown(r, c, value, !!opts.isX, !opts.text)}
        readOnly={readOnly}
        aria-label={opts.label}
        aria-invalid={opts.invalid || undefined}
        title={opts.excluded ? `Excluded from analyses and graphs (${MOD}E to include)`
          : opts.invalid ? (t.xFormat === "dates"
            ? "Not read as a date; treated as blank" : "Not read as a time; treated as blank")
            : undefined}
        onChange={(e) => set(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => onCellFocus(r, c)}
        onBlur={() => setEditing((k) => (k === `${r}:${c}` ? null : k))}
        onPointerDown={(e) => onCellPointerDown(e, r, c)}
        onPaste={(e) => onPaste(e, r, c)}
      />
  );

  // ---- toolbar targets
  const cur = sel ?? { r0: 0, c0: Math.max(0, xCol), r1: 0, c1: Math.max(0, xCol) };
  const curRect = normRect(cur);
  const curCol = cols[cur.c0];
  const curDs = curCol?.kind === "y" ? curCol.dataset : -1;
  const rowsSelected = curRect.r1 - curRect.r0 + 1;
  const noun = shape.datasetNoun.toLowerCase();
  const edit = (fn: (x: DataTableModel) => DataTableModel) => onChange(fn);
  const sortKey: SortKey = curDs >= 0 ? { kind: "dataset", dataset: curDs }
    : curCol?.kind === "rowTitle" ? { kind: "rowTitle" }
      : shape.hasX ? { kind: "x" } : shape.hasRowTitles ? { kind: "rowTitle" }
        : { kind: "dataset", dataset: 0 };

  const createTable = (nt: DataTableModel, name: string) => {
    let dataId = "";
    api.apply((p) => {
      const res = addFamily(p, nt, name, newId);
      dataId = res.dataId;
      return res.project;
    });
    setDialog(null);
    if (dataId) api.select(dataId);
  };

  // ---- inspector scope
  const inspectRect: CellRect | null = !sel ? null : multi ? rect
    : cols[sel.c0]?.kind === "rowTitle" ? null
      : { r0: 0, r1: nRows - 1, c0: sel.c0, c1: sel.c0 };
  const scope = !sel ? "" : multi && rect
    ? `${rect.r1 - rect.r0 + 1} × ${rect.c1 - rect.c0 + 1} cells (rows ${rect.r0 + 1}–${rect.r1 + 1})`
    : cols[sel.c0] ? `${columnLabel(t, cols[sel.c0])}, all rows` : "";

  const datasetHint = HINTS[t.type];
  const summary = t.subcolumnFormat !== "replicates";

  return (
    <div className="grid-editor">
      <div className="grid-toolbar" role="group" aria-label="Data table tools">
        {!readOnly && (
          <button type="button" onClick={() => setDialog({ kind: "import" })}
            title="Import a CSV, text or .xlsx file, or pasted text">Import…</button>
        )}
        <button type="button" onClick={() => setDialog({ kind: "export" })}
          title="Download as CSV or tab-separated text, or copy">Export…</button>
        {!readOnly && (
          <>
            <span className="tb-sep" aria-hidden="true" />
            <button type="button" onClick={() => setDialog({ kind: "sort" })}>Sort…</button>
            <button type="button" onClick={() => setDialog({ kind: "series" })}
              title="Fill a column with an arithmetic or geometric series">Insert series…</button>
            <MenuButton label="Rows" items={[
              { label: "Insert row above", onSelect: () => edit((x) => insertRows(x, curRect.r0, 1)) },
              { label: "Insert row below", hint: `${MOD}⇧↵`,
                onSelect: () => edit((x) => insertRows(x, curRect.r1 + 1, 1)) },
              "sep",
              { label: rowsSelected > 1 ? `Delete rows ${curRect.r0 + 1}–${curRect.r1 + 1}`
                : `Delete row ${curRect.r0 + 1}`, danger: true, disabled: nRows <= 1,
              onSelect: () => { edit((x) => deleteRows(x, curRect.r0, rowsSelected)); setSel(null); } },
            ]} />
            <MenuButton label={shape.datasetNoun === "Dataset" ? "Columns" : `${shape.datasetNoun}s`} items={[
              { label: `Insert ${noun} to the left`,
                onSelect: () => edit((x) => insertDataset(x, Math.max(0, curDs))) },
              { label: `Insert ${noun} to the right`,
                onSelect: () => edit((x) => insertDataset(x, curDs >= 0 ? curDs + 1 : x.datasets.length)) },
              "sep",
              { label: "Move left", disabled: curDs <= 0,
                onSelect: () => edit((x) => moveDataset(x, curDs, curDs - 1)) },
              { label: "Move right", disabled: curDs < 0 || curDs >= t.datasets.length - 1,
                onSelect: () => edit((x) => moveDataset(x, curDs, curDs + 1)) },
              "sep",
              { label: curDs >= 0 ? `Delete ${t.datasets[curDs]?.name || noun}` : `Delete ${noun}`,
                danger: true, disabled: curDs < 0 || t.datasets.length <= 1,
                onSelect: () => edit((x) => deleteDataset(x, curDs)) },
            ]} />
            <span className="tb-sep" aria-hidden="true" />
            <button type="button" onClick={() => setDialog({ kind: "format" })}
              title="Y value format, X dates or times, decimal places">Format…</button>
            {allowsSummaryFormat(t.type) && (
              <button type="button" onClick={() => setDialog({ kind: "convert" })}
                title="Create a new table of means and errors from this one">Convert…</button>
            )}
            <button type="button" onClick={() => setDialog({ kind: "reshape" })}
              title={t.type === "multivariable" ? "Make a wide table (groups as columns) from this long table"
                : "Make a long table (one observation per row) from this one"}>Reshape…</button>
          </>
        )}
      </div>

      <div className={`data-table${readOnly ? " is-readonly" : ""}${selecting ? " selecting" : ""}`}
        ref={wrap} onPointerMove={onPointerMove}
        onCopy={(e) => onCopy(e, false)} onCut={(e) => onCopy(e, true)}>
        <table>
          <thead>
            <tr>
              <th className="rownum" />
              {shape.hasRowTitles && (
                <th className="row-label-head" rowSpan={showSubhead ? 2 : 1}>
                  {t.type === "contingency" ? "" : "Row title"}
                </th>
              )}
              {shape.hasX && (
                <th className="xhead" rowSpan={showSubhead ? 2 : 1}>
                  <input className="ds-name" value={t.xTitle} readOnly={readOnly}
                    aria-label="X column title" placeholder="X"
                    onChange={(e) => onChange((x) => ({ ...x, xTitle: e.target.value }),
                      key("xtitle"))} />
                  {t.xFormat !== "numbers" && (
                    <span className="x-format-tag">
                      {t.xFormat === "dates" ? "dates" : "elapsed time"}
                    </span>
                  )}
                </th>
              )}
              {t.datasets.map((d, di) => (
                <th key={di} colSpan={subCount(d)} className="group-head">
                  <input
                    className="ds-name"
                    value={d.name}
                    readOnly={readOnly}
                    aria-label={`${shape.datasetNoun} ${di + 1} title`}
                    onChange={(e) => onChange((x) => renameDataset(x, di, e.target.value),
                      key(`ds:${di}`))}
                  />
                  {!readOnly && (
                    <span className="ds-tools">
                      {shape.hasSubcolumns && t.subcolumnFormat === "replicates"
                        && t.type !== "column" && (
                        <>
                          <button title="Remove a subcolumn"
                            aria-label={`Remove a subcolumn from ${d.name}`}
                            onClick={() => onChange((x) => setSubcolumnCount(x, di, subCount(d) - 1))}>−</button>
                          <button title="Add a subcolumn"
                            aria-label={`Add a subcolumn to ${d.name}`}
                            onClick={() => onChange((x) => setSubcolumnCount(x, di, subCount(d) + 1))}>+</button>
                        </>
                      )}
                      {t.datasets.length > 1 && (
                        <button title={`Delete ${noun}`}
                          aria-label={`Delete ${d.name}`}
                          onClick={() => onChange((x) => deleteDataset(x, di))}>✕</button>
                      )}
                    </span>
                  )}
                  {summary && di === 0 && (
                    <span className="format-tag">{SUBCOLUMN_FORMAT_LABELS[t.subcolumnFormat]}</span>
                  )}
                </th>
              ))}
              <th className="rowtools" />
            </tr>
            {showSubhead && (
              <tr className="subhead">
                <th className="rownum" />
                {t.datasets.map((d, di) => t.type === "multivariable" ? (
                  <th key={di}>
                    <select className="var-type" value={d.varType ?? "continuous"}
                      disabled={readOnly}
                      aria-label={`${d.name} variable type`}
                      onChange={(e) => onChange((x) => setVarType(x, di, e.target.value as VarType))}>
                      <option value="continuous">Continuous</option>
                      <option value="categorical">Categorical</option>
                    </select>
                  </th>
                ) : (
                  Array.from({ length: subCount(d) }, (_, s) => (
                    <th key={`${di}-${s}`}>
                      <input className="sub-title" value={d.subTitles?.[s] ?? ""}
                        placeholder={subLabel(t.type, di, s)}
                        readOnly={readOnly || (t.type === "survival" && s < 2)
                          || t.subcolumnFormat !== "replicates"}
                        aria-label={`${d.name} subcolumn ${s + 1} title`}
                        onChange={(e) => onChange((x) => setSubTitle(x, di, s, e.target.value),
                          key(`sub:${di}:${s}`))} />
                    </th>
                  ))
                ))}
                <th className="rowtools" />
              </tr>
            )}
          </thead>
          <tbody>
            {Array.from({ length: nRows }, (_, r) => (
              <tr key={r}>
                <td className="rownum">{r + 1}</td>
                {shape.hasRowTitles && (
                  <th className={`row-label${inSel(r, rowTitleCol) ? " sel" : ""}`}>
                    <input className="ds-name" value={t.rowTitles[r] ?? ""}
                      data-r={r} data-c={rowTitleCol}
                      readOnly={readOnly}
                      aria-label={`Row ${r + 1} title`}
                      onChange={(e) => onChange((x) => setRowTitle(x, r, e.target.value),
                        key(`rt:${r}`))}
                      onKeyDown={onKeyDown}
                      onFocus={() => onCellFocus(r, rowTitleCol)}
                      onBlur={() => setEditing(null)}
                      onPointerDown={(e) => onCellPointerDown(e, r, rowTitleCol)}
                      onPaste={(e) => onPaste(e, r, rowTitleCol)} />
                  </th>
                )}
                {shape.hasX && (() => {
                  const ex = isExcluded(t, { kind: "x", row: r });
                  const bad = t.xFormat !== "numbers" && xInvalid(t, t.x[r]);
                  const cls = [ex && "excluded", bad && "x-invalid", inSel(r, xCol) && "sel"]
                    .filter(Boolean).join(" ");
                  return (
                    <td className={cls || undefined}>
                      {cellInput(r, xCol, t.x[r], (v) => onChange((x) => setX(x, r, v),
                        key(`x:${r}`)), {
                        excluded: ex, text: t.xFormat !== "numbers", isX: true, invalid: bad,
                        label: `X, row ${r + 1}`,
                      })}
                    </td>
                  );
                })()}
                {t.datasets.map((d, di) =>
                  d.rows[r]?.map((v, s) => {
                    const ex = isExcluded(t, { kind: "y", dataset: di, row: r, sub: s });
                    const c = dsBase[di] + s;
                    const cls = [ex && "excluded", inSel(r, c) && "sel"].filter(Boolean).join(" ");
                    return (
                      <td key={`${di}-${s}`} className={cls || undefined}>
                        {cellInput(r, c, v,
                          (nv) => onChange((x) => setCell(x, di, r, s, nv),
                            key(`c:${di}:${r}:${s}`)),
                          {
                            excluded: ex,
                            text: !numeric && d.varType === "categorical",
                            label: `${d.name}, ${subCount(d) > 1
                              ? `${d.subTitles?.[s] || subLabel(t.type, di, s)}, ` : ""}row ${r + 1}`,
                          })}
                      </td>
                    );
                  }),
                )}
                <td className="rowtools">
                  {!readOnly && nRows > 1 && (
                    <button title="Delete row" aria-label={`Delete row ${r + 1}`}
                      onClick={() => onChange((x) => deleteRow(x, r))}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-actions">
          {!readOnly && (
            <>
              <button onClick={() => onChange(addRow)}>+ Row</button>
              <button onClick={() => onChange((x) => addDataset(x))}>
                + {shape.datasetNoun}
              </button>
            </>
          )}
          {readOnly ? (
            // Derived and frozen tables cannot take pasted values: say why
            // instead of how to enter data.
            <span className="hint">
              {sheet.derived ? "Read-only: computed from its source table (see the note above). "
                + "Unlink it to edit the values."
                : sheet.frozen ? "Read-only: this table is frozen."
                  : api.readOnly ? "Read-only: a shared project. Make a copy to edit it." : "Read-only."}
            </span>
          ) : datasetHint && <span className="hint">{datasetHint}</span>}
        </div>
      </div>

      {inspectRect ? (
        <DataInspector table={t} rect={inspectRect} scope={scope} />
      ) : (
        <section className="data-inspector" aria-label="Data inspector">
          <h3>Data inspector</h3>
          <p className="hint-block">
            Click a cell to summarize its column, or drag / Shift+arrow to
            select a block.
          </p>
        </section>
      )}

      {dialog?.kind === "import" && (
        <ImportDialog table={t} initial={dialog.req}
          onClose={() => setDialog(null)}
          onPasteAsIs={dialog.paste ? () => {
            const p = dialog.paste!;
            onChange((x) => pasteBlock(x, p.r, p.c, parseClipboardGrid(p.text)));
            setDialog(null);
          } : undefined}
          onImport={(fn) => { onChange(fn); setDialog(null); }} />
      )}
      {dialog?.kind === "export" && (
        <ExportDialog table={t} name={sheet.name} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "sort" && (
        <SortDialog table={t} initialKey={sortKey} onClose={() => setDialog(null)}
          onReverse={() => { edit(reverseRows); setDialog(null); }}
          onSort={(k, dir) => { edit((x) => sortRows(x, k, dir)); setDialog(null); }} />
      )}
      {dialog?.kind === "series" && (
        <SeriesDialog table={t} row={curRect.r0} col={cur.c0}
          count={rowsSelected > 1 ? rowsSelected : Math.max(1, nRows - curRect.r0)}
          onClose={() => setDialog(null)}
          onInsert={(r, c, spec) => { edit((x) => insertSeries(x, r, c, spec)); setDialog(null); }} />
      )}
      {dialog?.kind === "format" && (
        <TableFormatDialog table={t} onClose={() => setDialog(null)}
          onConvert={() => setDialog({ kind: "convert" })}
          onApply={(fn) => { edit(fn); setDialog(null); }} />
      )}
      {dialog?.kind === "reshape" && (
        <Suspense fallback={null}>
          <ReshapeDialog sheet={sheet} onClose={() => setDialog(null)} />
        </Suspense>
      )}
      {dialog?.kind === "convert" && (
        <ConvertDialog table={t} name={sheet.name} onClose={() => setDialog(null)}
          onCreate={createTable} />
      )}
    </div>
  );
}
