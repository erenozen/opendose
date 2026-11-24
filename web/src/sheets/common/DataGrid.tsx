import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { announce, Button, IconButton, notify } from "../../components/ui";
import { CloseIcon } from "../../components/ui/feedbackIcons";
import { MinusIcon, PlusIcon } from "./gridIcons";
import { useProject } from "../../app/context";
// factory -> registry -> this grid is a module cycle; addFamily is only
// called from an event handler, never while modules evaluate.
import { addFamily } from "../../app/factory";
import { toDelimited } from "../../project/exportTable";
import { newId } from "../../project/ids";
import { pasteNeedsImport } from "../../project/importText";
import { importIntoSheet } from "../../project/importRecord";
import { pasteWithReport, withFixed, type PasteReport } from "../../project/pasteReport";
import { fixCells, fixedText } from "../../project/unitCells";
import {
  blockText, fullPrecision, parseClipboardHtml, type FullValuesResult,
} from "../../project/clipboardHtml";
import {
  addDataset, addRow, allowsSummaryFormat, blockValues, clearBlock, deleteDataset,
  deleteRow, deleteRows, flatColumns, insertDataset, insertRows, insertSeries,
  hasAnyValue, isExcluded, moveDataset, normRect, parseCell, parseClipboardGrid,
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
import ExclusionReasonPrompt, { type ReasonAsk } from "./ExclusionReasonPrompt";
import { newlyExcluded, reasonAt } from "../../project/exclusions";
import PasteReportStrip from "./PasteReportStrip";
import FormulaColumnDialog from "./FormulaColumnDialog";
import ExcludeByIdDialog from "./ExcludeByIdDialog";
import { BlindBanner, BlindDialog, UnblindDialog } from "./BlindTable";
import GridFindBar, { GridReplaceRow } from "./GridFindBar";
import { onGridFind, onGridReplace } from "../../app/gridFind";
import { takeReport } from "../../app/tableFile";
import { findInTable, replaceInTable } from "../../project/findInTable";
import { calcCell, evalCellExpression, isCalculated } from "../../project/calculated";
import { fillDown, fillDownSummary } from "../../project/fillDown";
import { cellReady, edgeJump, lastUsedCell, movesCell } from "./gridNav";
import {
  DEFAULT_ROW_PX, INITIAL_ROWS, rowSegments, sameRange, scrollTopFor, shouldVirtualise,
  nextRange, type RowRange,
} from "./virtualRows";
import { lazy, Suspense } from "react";

// Wide <-> long (src/share), loaded when first opened.
const ReshapeDialog = lazy(() => import("../../share/ReshapeDialog"));
// Convert table to… another type or layout (project/convertType.ts).
const ConvertTypeDialog = lazy(() => import("./ConvertTypeDialog"));
const CONVERTIBLE: TableType[] = ["column", "grouped", "xy", "multivariable"];
import "./grid.css";

// Default subcolumn header when the user has not titled it.
function subLabel(type: TableType, di: number, s: number): string {
  if (type === "nested") return `${String.fromCharCode(65 + (di % 26))}${s + 1}`;
  if (type === "survival") return ["Time", "Event"][s] ?? `Covariate ${s - 1}`;
  return `Y${s + 1}`;
}

// The empty state under a table with no values: how this type is filled.
const EMPTY_HINTS: Partial<Record<TableType, string>> = {
  xy: "Paste a block from Excel or type: X (dose, concentration or time) in the first column, Y values next to it.",
  column: "Paste a block from Excel or type: one column per group, values down the rows.",
  grouped: "Paste a block from Excel or type: rows are levels of one factor, columns levels of the other, replicates side by side.",
  contingency: "Type or paste counts, not percentages: one row per group, one column per outcome.",
  survival: "Paste or type one row per subject: the time, then the event (1 = event, 0 = censored).",
  partsofwhole: "Type or paste one row per part of the whole, titled on the left.",
  multivariable: "Paste a block from Excel or type: one row per observation, one column per variable.",
  nested: "Paste a block from Excel or type: one subcolumn per subgroup (such as one animal) under its group, values down the rows.",
};

/** A block pasted at (r, c): its text and, from a spreadsheet copy, the
 *  stored full values (clipboardHtml.ts). */
type Pasted = { text: string; r: number; c: number; source?: FullValuesResult };

type Dialog =
  | { kind: "import"; req?: ImportRequest; paste?: Pasted }
  | { kind: "export" } | { kind: "sort" } | { kind: "series" } | { kind: "format" }
  | { kind: "convert" } | { kind: "reshape" } | { kind: "convertType" }
  | { kind: "formula"; dataset: number; isNew: boolean }
  | { kind: "excludeIds" } | { kind: "blind" } | { kind: "unblind" };

/** Set (or, with formula null, remove) a column's formula; a calculated
 *  column's values are filled by app/useCalculatedSync. */
function withFormula(t: DataTableModel, di: number, formula: string | null, name?: string): DataTableModel {
  const datasets = t.datasets.map((d, i) => {
    if (i !== di) return d;
    const next: DataColumn = { ...d, ...(name ? { name } : {}) };
    delete next.formulaError;
    if (formula) next.formula = formula;
    else delete next.formula;
    return next;
  });
  return { ...t, datasets };
}

const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";
/** Find and replace: Ctrl+H, or ⌘⇧H on a Mac, where ⌘H hides the browser. */
const REPLACE_KEY = mac ? "⌘⇧H" : "Ctrl+H";

/**
 * Generic editor for every table type. Layout, left to right: row number,
 * row titles (column / grouped / contingency / parts of whole), X (XY),
 * then each dataset's subcolumns. Keyboard: arrows move between cells
 * (left/right once the caret reaches the edge), Enter / Shift+Enter move
 * down / up, Shift+arrows (or a mouse drag, or Shift+click) select a
 * block; on a block Delete clears, Ctrl/Cmd+C / X copy / cut it as
 * tab-separated text and Ctrl/Cmd+E excludes or includes it. Ctrl/Cmd+V
 * pastes at the cursor. Ctrl/Cmd+Shift+Enter inserts a row below.
 * Spreadsheet keys (gridNav.ts): Ctrl/Cmd+arrows jump to the edge of the
 * data (with Shift, select up to it), Ctrl/Cmd+A selects the table,
 * Ctrl/Cmd+D fills down (fillDown.ts), Home / End go to the row's first /
 * last cell and Ctrl/Cmd+Home / End to the table's first / last used one.
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
  const gridId = useId();

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
  // After Ctrl/Cmd+E excludes values: ask why (skippable, never blocks).
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk | null>(null);
  const closeReason = useCallback(() => setReasonAsk(null), []);
  const askReason = (after: DataTableModel) => {
    const refs = newlyExcluded(t, after);
    setReasonAsk(refs.length ? { sheetId: sheet.id, refs } : null);
  };
  // What the last paste / import did to each cell (kept per sheet).
  const [pasteInfo, setPasteInfo] = useState<{
    id: string; verb: "Pasted" | "Imported"; report: PasteReport;
    paste?: Pasted;
  } | null>(null);
  const shownReport = pasteInfo?.id === sheet.id ? pasteInfo : null;
  // A table just made from a file dropped on the page or opened
  // (app/tableFile.ts) shows its import report as the toolbar's Import does.
  useEffect(() => {
    const handed = takeReport(sheet.id);
    if (handed) setPasteInfo({ id: sheet.id, verb: "Imported", report: handed });
  }, [sheet.id]);
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

  // ---- row virtualisation (virtualRows.ts): a long table renders the
  // rows in view plus an overscan; the rest are spacer rows.
  const virtual = shouldVirtualise(nRows);
  const [rowPx, setRowPx] = useState(DEFAULT_ROW_PX);
  const [range, setRange] = useState<RowRange>({ start: 0, end: INITIAL_ROWS });
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const pendingFocus = useRef<{ r: number; c: number } | null>(null);
  const metrics = () => {
    const w = wrap.current, b = bodyRef.current;
    if (!w || !b) return null;
    const bodyTop = b.getBoundingClientRect().top - w.getBoundingClientRect().top - w.clientTop
      + w.scrollTop;
    return { scrollTop: w.scrollTop, viewport: w.clientHeight, bodyTop, rowPx };
  };
  const updateRange = () => {
    const m = metrics();
    if (!m) return;
    setRange((cur) => {
      const next = nextRange(cur, m, nRows);
      return sameRange(cur, next) ? cur : next;
    });
  };
  const updateRef = useRef(updateRange);
  updateRef.current = updateRange;
  // Measure the real row height from the rendered rows (one-line inputs:
  // all rows are as tall), then recompute the rows in view.
  useLayoutEffect(() => {
    if (!virtual) return;
    const rows = bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]");
    if (rows && rows.length > 4) {
      const first = rows[0], last = rows[rows.length - 1];
      const span = Number(last.dataset.row) - Number(first.dataset.row) + 1;
      if (span === rows.length) {
        const px = (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / span;
        if (px > 8 && Math.abs(px - rowPx) > 0.25) setRowPx(px);
      }
    }
  }, [virtual, range, nRows, rowPx]);
  useLayoutEffect(() => {
    if (virtual) updateRef.current();
  }, [virtual, nRows, rowPx, sheet.id]);
  useEffect(() => {
    const w = wrap.current;
    if (!w || !virtual) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => updateRef.current());
    };
    w.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(w);
    return () => { w.removeEventListener("scroll", on); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [virtual]);
  // A cell asked for before its row was rendered gets focus once it is.
  useLayoutEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    const el = wrap.current?.querySelector<HTMLInputElement>(
      `input[data-r="${p.r}"][data-c="${p.c}"]`);
    if (el) { pendingFocus.current = null; el.focus(); el.select(); }
  });

  // Keep a row in view (the far corner of a Shift+arrow block).
  const revealRow = (r: number) => {
    const w = wrap.current, m = metrics();
    if (!virtual || !w || !m) return;
    const top = scrollTopFor(r, m, headRef.current?.getBoundingClientRect().height ?? 0);
    if (top !== null) w.scrollTop = top;
  };

  const focusCell = (r: number, c: number) => {
    const el = wrap.current?.querySelector<HTMLInputElement>(
      `input[data-r="${r}"][data-c="${c}"]`);
    const w = wrap.current;
    if (el) {
      el.focus();
      el.select();
    } else if (virtual && w) {
      // Not rendered yet: scroll it into view, render, then focus.
      pendingFocus.current = { r, c };
      const m = metrics();
      const head = headRef.current?.getBoundingClientRect().height ?? 0;
      const top = m ? scrollTopFor(r, m, head) : null;
      if (top !== null) w.scrollTop = top;
      updateRange();
    }
  };

  const key = (what: string) => `${sheet.id}:${what}`;

  const filledAt = (r: number, c: number) => {
    const col = cols[c];
    const v = !col ? "" : col.kind === "x" ? t.x[r] : col.kind === "rowTitle" ? t.rowTitles[r]
      : t.datasets[col.dataset]?.rows[r]?.[col.sub];
    return !!v && v.trim() !== "";
  };
  // Ctrl/Cmd+D or More › Fill down: one edit, so one undo (fillDown.ts)
  const fillDownNow = (block: CellRect) => {
    const res = fillDown(t, block);
    if (res.changed) onChange((x) => fillDown(x, block).table);
    announce(fillDownSummary(res), "polite");
  };

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
      if (multi && rect) {
        onChange((x) => toggleBlockExcluded(x, rect));
        askReason(toggleBlockExcluded(t, rect));
        return;
      }
      const ref = refAt(r, c);
      if (ref) { onChange((x) => toggleExcluded(x, ref)); askReason(toggleExcluded(t, ref)); }
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
    // Spreadsheet keys (gridNav.ts): Ctrl/Cmd+Arrow to the edge of the
    // data, with Shift to select up to it, Ctrl/Cmd+A, Ctrl/Cmd+D, Home,
    // End. A cell being edited keeps the caret keys that move in its text.
    const caret = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0,
      length: el.value.length, readOnly: el.readOnly };
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && !e.shiftKey && k === "d") {
      e.preventDefault();
      if (!readOnly) fillDownNow(multi && rect ? rect : { r0: r, c0: c, r1: r, c1: c });
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && k === "a" && (multi || cellReady(caret))) {
      e.preventDefault();
      focusCell(0, 0);
      setSel({ r0: 0, c0: 0, r1: nRows - 1, c1: flat - 1 });
      revealRow(0);
      return;
    }
    const steps: Record<string, [number, number]> = {
      ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const step = steps[e.key];
    if (mod && !e.altKey && step
      && (step[1] === 0 || multi || movesCell(caret, step[1] < 0 ? "start" : "end"))) {
      e.preventDefault();
      const from = e.shiftKey && sel ? [sel.r1, sel.c1] : [r, c];
      const [tr, tc] = edgeJump(filledAt, from[0], from[1], step[0], step[1], nRows, flat);
      if (e.shiftKey) {
        const base = sel ?? { r0: r, c0: c, r1: r, c1: c };
        setSel({ ...base, r1: tr, c1: tc });
        revealRow(tr);
      } else {
        setSel({ r0: tr, c0: tc, r1: tr, c1: tc });
        focusCell(tr, tc);
      }
      return;
    }
    if ((e.key === "Home" || e.key === "End") && !e.shiftKey && !e.altKey
      && (mod || multi || movesCell(caret, e.key === "Home" ? "start" : "end"))) {
      e.preventDefault();
      const [tr, tc] = e.key === "Home" ? (mod ? [0, 0] : [r, 0])
        : mod ? lastUsedCell(filledAt, nRows, flat) : [r, flat - 1];
      setSel({ r0: tr, c0: tc, r1: tr, c1: tc });
      focusCell(tr, tc);
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
      const r1 = Math.max(0, Math.min(nRows - 1, base.r1 + dr));
      setSel({ ...base, r1, c1: Math.max(0, Math.min(flat - 1, base.c1 + dc)) });
      revealRow(r1);
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
    // A copy from Excel, Google Sheets or Calc also carries the numbers
    // it stores: a cell shown rounded gets its full value.
    // (The text is split into cells only when such values came with it.)
    const html = parseClipboardHtml(e.clipboardData.getData("text/html"));
    const source = fullPrecision(html?.app ? parseClipboardGrid(text) : [], html);
    const full = source.kind === "full" ? source.full : null;
    const routed = full ? blockText(full.block) : text;
    if (pasteNeedsImport(routed)) {
      setDialog({ kind: "import", req: { text: routed, mode: "insert", row: pr, col: pc,
        ...(full?.rounded.length ? { fullValues: { app: full.app, rounded: full.rounded.length } } : {}) },
      paste: { text, r: pr, c: pc, source } });
      return;
    }
    pasteAt({ text, r: pr, c: pc, source });
  };

  // A direct paste: the block as typed (with a spreadsheet's full values),
  // with its report above the grid.
  const pasteAt = (p: Pasted) => {
    const block = parseClipboardGrid(p.text);
    const { report } = pasteWithReport(t, p.r, p.c, block, p.source);
    onChange((x) => pasteWithReport(x, p.r, p.c, block, p.source).table);
    setPasteInfo({ id: sheet.id, verb: "Pasted", report, paste: p });
  };

  const jumpTo = (r: number, c: number) => {
    setSel({ r0: r, c0: c, r1: r, c1: c });
    requestAnimationFrame(() => focusCell(r, c));
  };

  // ---- find (Ctrl/Cmd+F in the table, More › Find…, or the palette)
  const [findOpen, setFindOpen] = useState(false);
  const [findAsk, setFindAsk] = useState(0);
  const [findText, setFindText] = useState("");
  const [findAt, setFindAt] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  // Replace (Ctrl+H, ⌘⇧H, More › Replace…): its row of the find bar
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceText, setReplaceText] = useState("");
  const [wholeCell, setWholeCell] = useState(false);
  const [replaceStatus, setReplaceStatus] = useState("");
  const findOpts = useMemo(() => ({ whole: replaceOpen && wholeCell }), [replaceOpen, wholeCell]);
  const hits = useMemo(() => findInTable(t, findText, findOpts), [t, findText, findOpts]);
  // the match shown (outlined while the find box has text)
  const curHit = findOpen && findText.trim() && hits.length ? hits[Math.min(findAt, hits.length - 1)] : null;
  const isHit = (r: number, c: number) => !!curHit && curHit.r === r && curHit.c === c;
  // Asked for by a key or a command: the bar appears in the same frame
  // with the query selected, ready to type over (forms.md, Autofocus).
  const openFind = () => { setFindOpen(true); setFindAsk((n) => n + 1); };
  useLayoutEffect(() => {
    if (!findAsk) return;
    findRef.current?.focus();
    findRef.current?.select();
  }, [findAsk]);
  useEffect(() => onGridFind((id) => {
    if (id !== sheet.id) return;
    setFindOpen(true);
    setFindAsk((n) => n + 1);
  }), [sheet.id]);
  useEffect(() => onGridReplace((id) => {
    if (id !== sheet.id || readOnly) return;
    setReplaceOpen(true);
    setReplaceStatus("");
    setFindOpen(true);
    setFindAsk((n) => n + 1);
  }), [sheet.id, readOnly]);
  const showHit = (i: number) => {
    if (!hits.length) return;
    const k = ((i % hits.length) + hits.length) % hits.length;
    setFindAt(k);
    const h = hits[k];
    setSel({ r0: h.r, c0: h.c, r1: h.r, c1: h.c });
    // keep typing in the find box: scroll the cell into view without focusing it
    requestAnimationFrame(() => {
      const el = wrap.current?.querySelector(`[data-r="${h.r}"][data-c="${h.c}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
      else focusCell(h.r, h.c);
    });
  };
  // The first Enter selects the match already outlined; later ones move on.
  const onHit = !!curHit && !!sel && sel.r0 === curHit.r && sel.c0 === curHit.c
    && sel.r1 === curHit.r && sel.c1 === curHit.c;
  const stepFind = (dir: -1 | 1) => showHit(dir < 0 ? findAt - 1 : (onHit ? findAt + 1 : findAt));
  // Closing puts focus back in the table, on the match shown (or the
  // selected cell), so the input's unmounting does not drop it to the page.
  const closeFind = () => {
    const h = curHit ?? (sel ? { r: sel.r0, c: sel.c0 } : { r: 0, c: 0 });
    setFindOpen(false);
    setFindText("");
    setFindAt(0);
    setReplaceOpen(false);
    setReplaceStatus("");
    jumpTo(h.r, h.c);
  };
  const openReplace = () => {
    if (readOnly) { openFind(); return; }
    setReplaceOpen(true);
    setReplaceStatus("");
    openFind();
  };
  // Each replace is one edit, so one undo puts every replaced cell back;
  // exclusions and their reasons stay (project/findInTable.ts).
  const replaceHits = (which: typeof hits) => {
    const query = findText;
    const r = replaceInTable(t, which, query, replaceText, findOpts);
    if (r.changed) onChange((x) => replaceInTable(x, which, query, replaceText, findOpts).table);
    const n = r.changed;
    setReplaceStatus(`Replaced ${n} ${n === 1 ? "cell" : "cells"}.`
      + (r.skipped ? ` ${r.skipped} in calculated columns left to their formula.` : ""));
  };
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === "f") {
      e.preventDefault();
      openFind();
    }
    // Ctrl+H (the browser's history outside the table), ⌘⇧H on a Mac
    // (⌘H hides the browser there)
    if (!e.altKey && k === "h" && (mac ? e.metaKey && e.shiftKey : e.ctrlKey && !e.metaKey && !e.shiftKey)) {
      e.preventDefault();
      openReplace();
    }
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
    opts: { excluded?: boolean; text?: boolean; label: string; isX?: boolean; invalid?: boolean;
      reason?: string; calc?: string }) => {
    // What the cell's state means, for the pointer (title) and for screen
    // readers and touch (the accessible description).
    const note = opts.calc !== undefined ? `Calculated: = ${opts.calc} (edit the formula in the column title)`
      : opts.excluded ? `Excluded from analyses and graphs${opts.reason ? `: ${opts.reason}` : ""} (${MOD}E to include)`
        : opts.invalid ? (t.xFormat === "dates"
          ? "Not read as a date; treated as blank" : "Not read as a time; treated as blank")
          : undefined;
    const noteId = note ? `${gridId}-n${r}-${c}` : undefined;
    return (
      <>
      <input
        data-r={r} data-c={c}
        // The text keyboard for values too: the iOS decimal pad has no
        // minus and no "e", so -9 and 1e-9 could not be typed (DECISIONS 7).
        inputMode="text"
        enterKeyHint="next"
        // Labels and codes are data: no autocorrect or capitals on phones
        autoCorrect="off" autoCapitalize="off" spellCheck={false} autoComplete="off"
        className={[opts.text && "text-cell", opts.calc !== undefined && "calc-cell"]
          .filter(Boolean).join(" ") || undefined}
        value={shown(r, c, value, !!opts.isX, !opts.text)}
        readOnly={readOnly || opts.calc !== undefined}
        aria-label={opts.label}
        aria-invalid={opts.invalid || undefined}
        aria-describedby={noteId}
        title={note}
        onChange={(e) => set(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => onCellFocus(r, c)}
        onBlur={() => {
          setEditing((k) => (k === `${r}:${c}` ? null : k));
          // "=2*3+1" typed in a number cell: its value
          if (!opts.text && opts.calc === undefined && value.trim().startsWith("=")) {
            const v = evalCellExpression(value);
            if (v !== null) set(calcCell(v));
          }
        }}
        onPointerDown={(e) => onCellPointerDown(e, r, c)}
        onPaste={(e) => onPaste(e, r, c)}
      />
      {note && <span id={noteId} hidden>{note}</span>}
      </>
    );
  };

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
  const inspectNow: CellRect | null = !sel ? null : multi ? rect
    : cols[sel.c0]?.kind === "rowTitle" ? null
      : { r0: 0, r1: nRows - 1, c0: sel.c0, c1: sel.c0 };
  // One object per selection, so the inspector's statistics (a whole
  // column of a long table) are not recomputed on every scroll or render.
  const inspectKey = inspectNow
    ? [inspectNow.r0, inspectNow.r1, inspectNow.c0, inspectNow.c1].join(":") : "";
  const inspectRect = useMemo((): CellRect | null => {
    if (!inspectKey) return null;
    const [r0, r1, c0, c1] = inspectKey.split(":").map(Number);
    return { r0, r1, c0, c1 };
  }, [inspectKey]);
  const scope = !sel ? "" : multi && rect
    ? `${rect.r1 - rect.r0 + 1} × ${rect.c1 - rect.c0 + 1} cells (rows ${rect.r0 + 1}–${rect.r1 + 1})`
    : cols[sel.c0] ? `${columnLabel(t, cols[sel.c0])}, all rows` : "";

  // An empty table says how to fill it; once it holds a value the grid
  // speaks for itself (DECISIONS 1).
  const emptyHint = hasAnyValue(t) ? null : EMPTY_HINTS[t.type];
  // The selected cell's exclusion, for the inspector.
  const selRef = sel && !multi ? refAt(sel.r0, sel.c0) : null;
  const cellNote = selRef && isExcluded(t, selRef)
    ? `This value is excluded${reasonAt(t, selRef) ? `: ${reasonAt(t, selRef)}` : ""}.`
    : undefined;

  // One body row (virtualised tables render only some of them).
  const headRows = showSubhead ? 2 : 1;
  const colCount = 2 + (shape.hasRowTitles ? 1 : 0) + (shape.hasX ? 1 : 0)
    + t.datasets.reduce((n, d) => n + subCount(d), 0);
  const segments = virtual ? rowSegments(nRows, range, [sel?.r0, sel?.r1]) : [];
  const renderRow = (r: number) => (
    <tr key={r} data-row={r} aria-rowindex={virtual ? r + headRows + 1 : undefined}>
      <td className="rownum">{r + 1}</td>
      {shape.hasRowTitles && (
        <th className={`row-label${inSel(r, rowTitleCol) ? " sel" : ""}${isHit(r, rowTitleCol) ? " find-hit" : ""}`}>
          <input className="ds-name" value={t.rowTitles[r] ?? ""}
            data-r={r} data-c={rowTitleCol}
            enterKeyHint="next" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            autoComplete="off"
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
        const cls = [ex && "excluded", bad && "x-invalid", inSel(r, xCol) && "sel", isHit(r, xCol) && "find-hit"]
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
          const cls = [ex && "excluded", inSel(r, c) && "sel", isHit(r, c) && "find-hit"].filter(Boolean).join(" ");
          return (
            <td key={`${di}-${s}`} className={cls || undefined}>
              {cellInput(r, c, v,
                (nv) => onChange((x) => setCell(x, di, r, s, nv),
                  key(`c:${di}:${r}:${s}`)),
                {
                  excluded: ex,
                  reason: ex ? reasonAt(t, { kind: "y", dataset: di, row: r, sub: s }) : undefined,
                  text: !numeric && d.varType === "categorical",
                  calc: isCalculated(d) ? d.formula : undefined,
                  label: `${d.name}, ${subCount(d) > 1
                    ? `${d.subTitles?.[s] || subLabel(t.type, di, s)}, ` : ""}row ${r + 1}`,
                })}
            </td>
          );
        }),
      )}
      <td className="rowtools">
        {/* Out of the tab order: Tab walks values, not a destructive
            button per row (the Rows menu deletes from the keyboard). */}
        {!readOnly && nRows > 1 && (
          <IconButton size="sm" tabIndex={-1} title="Delete row" aria-label={`Delete row ${r + 1}`}
            onClick={() => onChange((x) => deleteRow(x, r))}><CloseIcon /></IconButton>
        )}
      </td>
    </tr>
  );
  const summary = t.subcolumnFormat !== "replicates";

  return (
    <div className="grid-editor" onKeyDown={onGridKeyDown}>
      <div className="grid-toolbar" role="group" aria-label="Data table tools" data-still>
        {!readOnly && (
          <Button variant="ghost" onClick={() => setDialog({ kind: "import" })}
            title="Import a CSV, text or workbook file (.xlsx, .xls, .ods), or pasted text">Import…</Button>
        )}
        <Button variant="ghost" onClick={() => setDialog({ kind: "export" })}
          title="Download as CSV or tab-separated text, or copy">Export…</Button>
        {!readOnly && (
          <>
            <MenuButton label="Rows" items={[
              { label: "Insert row above", onSelect: () => edit((x) => insertRows(x, curRect.r0, 1)) },
              { label: "Insert row below", hint: `${MOD}⇧↵`,
                onSelect: () => edit((x) => insertRows(x, curRect.r1 + 1, 1)) },
              "sep",
              { label: "Exclude by ID…",
                description: "Leave out every value of the rows whose IDs you paste",
                onSelect: () => setDialog({ kind: "excludeIds" }) },
              "sep",
              { label: rowsSelected > 1 ? `Delete rows ${curRect.r0 + 1}–${curRect.r1 + 1}`
                : `Delete row ${curRect.r0 + 1}`, danger: true, disabled: nRows <= 1,
              onSelect: () => { edit((x) => deleteRows(x, curRect.r0, rowsSelected)); setSel(null); } },
            ]} />
            <MenuButton label={shape.datasetNoun === "Dataset" ? "Columns" : `${shape.datasetNoun}s`}
              items={[
              { label: `Insert ${noun} to the left`,
                onSelect: () => edit((x) => insertDataset(x, Math.max(0, curDs))) },
              { label: `Insert ${noun} to the right`,
                onSelect: () => edit((x) => insertDataset(x, curDs >= 0 ? curDs + 1 : x.datasets.length)) },
              "sep",
              { label: "New calculated column…",
                onSelect: () => setDialog({ kind: "formula", dataset: t.datasets.length, isNew: true }) },
              ...(curDs >= 0 && isCalculated(t.datasets[curDs]) ? [
                { label: `Edit the formula of ${t.datasets[curDs].name || noun}…`,
                  onSelect: () => setDialog({ kind: "formula", dataset: curDs, isNew: false }) },
              ] : []),
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
            <MenuButton label="More" items={[
              { label: "Find…", hint: `${MOD}F`, onSelect: openFind },
              { label: "Replace…", hint: REPLACE_KEY, onSelect: openReplace },
              "sep",
              { label: "Fill down", hint: `${MOD}D`, onSelect: () => fillDownNow(curRect) },
              { label: "Sort…", onSelect: () => setDialog({ kind: "sort" }) },
              { label: "Insert series…", description: "Fill a column with an arithmetic or geometric series",
                onSelect: () => setDialog({ kind: "series" }) },
              "sep",
              { label: "Format…", description: "Y value format, X dates or times, decimal places",
                onSelect: () => setDialog({ kind: "format" }) },
              ...(allowsSummaryFormat(t.type) ? [{ label: "Convert…",
                description: "A new table of means and errors from this one",
                onSelect: () => setDialog({ kind: "convert" }) }] : []),
              ...(CONVERTIBLE.includes(t.type) ? [{ label: "Convert table to…",
                description: "A new table of another type or layout, every value, exclusion and pairing kept",
                onSelect: () => setDialog({ kind: "convertType" }) }] : []),
              { label: "Reshape…", description: t.type === "multivariable"
                ? "A wide table (groups as columns) from this long table"
                : "A long table (one observation per row) from this one",
              onSelect: () => setDialog({ kind: "reshape" }) },
              "sep",
              sheet.blinding
                ? { label: "Unblind…", description: "Put the group names back, with the key",
                  onSelect: () => setDialog({ kind: "unblind" }) }
                : { label: "Blind this table…", description: "Show the group names as codes until unblinded with the key",
                  onSelect: () => setDialog({ kind: "blind" }) },
            ]} />
          </>
        )}
      </div>

      {findOpen && (
        <GridFindBar inputRef={findRef} value={findText} at={findAt} count={hits.length}
          replaceOpen={replaceOpen}
          onValueChange={(v) => { setFindText(v); setFindAt(0); setReplaceStatus(""); }}
          onStep={stepFind} onClose={closeFind}
          onToggleReplace={readOnly ? undefined : () => { setReplaceOpen(!replaceOpen); setReplaceStatus(""); }}>
          <GridReplaceRow value={replaceText} whole={wholeCell} count={hits.length} status={replaceStatus}
            onValueChange={(v) => { setReplaceText(v); setReplaceStatus(""); }}
            onWholeChange={(w) => { setWholeCell(w); setFindAt(0); }}
            onReplace={() => { if (curHit) replaceHits([curHit]); }}
            onReplaceAll={() => replaceHits(hits)}
            onClose={closeFind} />
        </GridFindBar>
      )}
      <BlindBanner sheet={sheet} onUnblind={readOnly ? undefined : () => setDialog({ kind: "unblind" })} />
      {reasonAsk?.sheetId === sheet.id && !readOnly && (
        <ExclusionReasonPrompt key={reasonAsk.refs.map((x) => JSON.stringify(x)).join()} table={t}
          refs={reasonAsk.refs} onSave={(fn) => onChange(fn)} onClose={closeReason} />
      )}
      <PasteReportStrip key={sheet.id} open={!!shownReport && !readOnly} verb={shownReport?.verb ?? "Pasted"}
        report={shownReport?.report ?? null} onJump={jumpTo}
        onDismiss={() => setPasteInfo(null)}
        onReimport={shownReport?.paste ? () => {
          const p = shownReport.paste!;
          setDialog({ kind: "import", req: { text: p.text, mode: "insert", row: p.r, col: p.c } });
        } : undefined}
        onFix={shownReport && !readOnly ? (how) => {
          // one edit (one undo step); the report forgets the cells it read
          const key = how === "unit" ? "units" : "percents";
          const cells = shownReport.report[key];
          const first = cells[0];
          const { changed } = fixCells(t, cells, how);
          onChange((x) => fixCells(x, cells, how).table);
          setPasteInfo({ ...shownReport, report: withFixed(shownReport.report, key) });
          notify(`Read ${changed} ${changed === 1 ? "cell" : "cells"} as numbers: “${first?.text}” as `
            + `${first ? fixedText(first.text, how) : ""}.`, {
            tone: "success",
            action: { label: "Undo", onAction: () => { api.undo(); setPasteInfo(shownReport); } },
          });
        } : undefined} />

      <div data-still className={`data-table${readOnly ? " is-readonly" : ""}${selecting ? " selecting" : ""}${virtual ? " virtual" : ""}`}
        ref={wrap} onPointerMove={onPointerMove}
        onCopy={(e) => onCopy(e, false)} onCut={(e) => onCopy(e, true)}>
        <table data-rows={nRows} aria-rowcount={virtual ? nRows + headRows : undefined}
          aria-label={sheet.name}>
          <thead ref={headRef}>
            <tr>
              <th className="rownum" scope="col"><span className="sr-only">Row</span></th>
              {shape.hasRowTitles && (
                <th className="row-label-head" rowSpan={showSubhead ? 2 : 1} scope="col">
                  {t.type === "contingency" ? <span className="sr-only">Row title</span> : "Row title"}
                </th>
              )}
              {shape.hasX && (
                <th className="xhead" rowSpan={showSubhead ? 2 : 1}>
                  <input className="ds-name" value={t.xTitle} readOnly={readOnly}
                    autoCorrect="off" autoCapitalize="off" spellCheck={false} autoComplete="off"
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
                  <div className="group-title">
                  <input
                    className="ds-name"
                    value={d.name}
                    readOnly={readOnly}
                    autoCorrect="off" autoCapitalize="off" spellCheck={false} autoComplete="off"
                    aria-label={`${shape.datasetNoun} ${di + 1} title`}
                    // a long name is cut at the column's edge: the full name on hover
                    title={d.name || undefined}
                    onChange={(e) => onChange((x) => renameDataset(x, di, e.target.value),
                      key(`ds:${di}`))}
                  />
                  {!readOnly && (
                    <span className="ds-tools">
                      {shape.hasSubcolumns && t.subcolumnFormat === "replicates"
                        && t.type !== "column" && (
                        <>
                          <IconButton size="sm" title="Remove a subcolumn"
                            aria-label={`Remove a subcolumn from ${d.name || `${noun} ${di + 1}`}`}
                            onClick={() => onChange((x) => setSubcolumnCount(x, di, subCount(d) - 1))}>
                            <MinusIcon /></IconButton>
                          <IconButton size="sm" title="Add a subcolumn"
                            aria-label={`Add a subcolumn to ${d.name || `${noun} ${di + 1}`}`}
                            onClick={() => onChange((x) => setSubcolumnCount(x, di, subCount(d) + 1))}>
                            <PlusIcon /></IconButton>
                        </>
                      )}
                      {t.datasets.length > 1 && (
                        <IconButton size="sm" title={`Delete ${noun}`}
                          aria-label={`Delete ${d.name || `${noun} ${di + 1}`}`}
                          onClick={() => onChange((x) => deleteDataset(x, di))}><CloseIcon /></IconButton>
                      )}
                    </span>
                  )}
                  </div>
                  {summary && di === 0 && (
                    <span className="format-tag">{SUBCOLUMN_FORMAT_LABELS[t.subcolumnFormat]}</span>
                  )}
                  {isCalculated(d) && (
                    <button type="button" data-still className={`formula-chip${d.formulaError ? " has-error" : ""}`}
                      disabled={readOnly}
                      title={d.formulaError ? `Not calculated: ${d.formulaError}` : "Calculated column: edit the formula"}
                      aria-label={`Formula of ${d.name}: ${d.formula}${d.formulaError ? ` (error: ${d.formulaError})` : ""}`}
                      onClick={() => setDialog({ kind: "formula", dataset: di, isNew: false })}>
                      = {d.formula}{d.formulaError ? " ⚠" : ""}
                    </button>
                  )}
                </th>
              ))}
              <td className="rowtools" />
            </tr>
            {showSubhead && (
              <tr className="subhead">
                <td className="rownum" />
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
                        autoCorrect="off" autoCapitalize="off" spellCheck={false} autoComplete="off"
                        readOnly={readOnly || (t.type === "survival" && s < 2)
                          || t.subcolumnFormat !== "replicates"}
                        aria-label={`${d.name} subcolumn ${s + 1} title`}
                        onChange={(e) => onChange((x) => setSubTitle(x, di, s, e.target.value),
                          key(`sub:${di}:${s}`))} />
                    </th>
                  ))
                ))}
                <td className="rowtools" />
              </tr>
            )}
          </thead>
          <tbody ref={bodyRef}>
            {/* One flat, keyed list: rows keep their elements (and the
                focused input) when the segments around them change. */}
            {virtual ? segments.flatMap((seg) => (seg.kind === "gap" ? [
              <tr key={`gap-${seg.at}`} className="grid-gap" aria-hidden="true">
                <td colSpan={colCount} style={{ height: seg.rows * rowPx }} />
              </tr>,
            ] : Array.from({ length: seg.end - seg.start }, (_, i) => renderRow(seg.start + i))))
              : Array.from({ length: nRows }, (_, r) => renderRow(r))}
          </tbody>
        </table>
        <div className="table-actions" data-still>
          {!readOnly && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onChange(addRow)}>
                <PlusIcon />Add row</Button>
              <Button variant="ghost" size="sm" onClick={() => onChange((x) => addDataset(x))}>
                <PlusIcon />Add {noun}</Button>
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
          ) : emptyHint && <span className="hint">{emptyHint}</span>}
        </div>
      </div>

      {/* Only with a selection: at rest the inspector has nothing to say. */}
      {inspectRect && (
        <DataInspector table={t} rect={inspectRect} scope={scope} cellNote={cellNote} />
      )}

      {dialog?.kind === "import" && (
        <ImportDialog table={t} initial={dialog.req}
          onClose={() => setDialog(null)}
          onPasteAsIs={dialog.paste ? () => {
            pasteAt(dialog.paste!);
            setDialog(null);
          } : undefined}
          onImport={(fn, report, facts) => {
            // with the import's record (P-76) in the same undo step
            if (facts) api.apply((p) => importIntoSheet(p, sheet.id, fn, facts));
            else onChange(fn);
            setDialog(null);
            if (report) setPasteInfo({ id: sheet.id, verb: "Imported", report });
          }} />
      )}
      {dialog?.kind === "blind" && <BlindDialog sheet={sheet} onClose={() => setDialog(null)} />}
      {dialog?.kind === "unblind" && <UnblindDialog sheet={sheet} onClose={() => setDialog(null)} />}
      {dialog?.kind === "export" && (
        <ExportDialog table={t} name={sheet.name} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "sort" && (
        <SortDialog table={t} initialKey={sortKey} onClose={() => setDialog(null)}
          onReverse={() => { edit(reverseRows); setDialog(null); }}
          onSort={(k, dir) => { edit((x) => sortRows(x, k, dir)); setDialog(null); }} />
      )}
      {dialog?.kind === "formula" && (
        <FormulaColumnDialog table={t} dataset={dialog.dataset} isNew={dialog.isNew}
          onClose={() => setDialog(null)}
          onStop={dialog.isNew ? undefined : () => {
            edit((x) => withFormula(x, dialog.dataset, null));
            setDialog(null);
          }}
          onSave={(formula, name) => {
            const di = dialog.dataset;
            edit((x) => withFormula(dialog.isNew ? insertDataset(x, x.datasets.length, name || "Calculated")
              : x, di, formula, name));
            setDialog(null);
          }} />
      )}
      {dialog?.kind === "excludeIds" && (
        <ExcludeByIdDialog table={t} onClose={() => setDialog(null)} onApply={(fn) => edit(fn)} />
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
      {dialog?.kind === "convertType" && (
        <Suspense fallback={null}>
          <ConvertTypeDialog table={t} name={sheet.name} onClose={() => setDialog(null)}
            onCreate={createTable} />
        </Suspense>
      )}
      {dialog?.kind === "convert" && (
        <ConvertDialog table={t} name={sheet.name} onClose={() => setDialog(null)}
          onCreate={createTable} />
      )}
    </div>
  );
}
