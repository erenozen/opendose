import { lazy, Suspense, useId, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { Button, Field, FileButton, Input, NumberField, Tabs } from "../../components/ui";
import { readXlsx, type XlsxSheet } from "../../lib/engine";
import {
  applyImport, applyImportWithCells, DEFAULT_FILTER, DEFAULT_SOURCE, defaultRoles, DELIMITER_LABELS, detectTitlesRowIn,
  importWidth, largePasteLines, prepareFromMatrix, sourceMatrix, type ColumnRole, type DecimalChoice,
  type DelimiterChoice, type FilterOptions, type PlacementOptions, type SourceOptions,
} from "../../project/importText";
import { flatColumns, hasAnyValue, tableShape } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import { isTableDrop } from "../../share/recipes/dropKind";
import type { PlainSpec } from "../../share/recipes/saved";
import { pasteReport, placedCells, type PasteReport } from "../../project/pasteReport";
import type { SheetApp } from "../../project/clipboardHtml";
import { visibleRows } from "../../lib/xlsxFlags";
import { decodeAs, detectEncoding, type FileEncoding } from "../../lib/fileText";
import WorkbookReport from "./WorkbookReport";

export interface ImportRequest {
  text?: string;                        // clipboard text to start from
  mode?: PlacementOptions["mode"];
  row?: number;                         // insert position (0-based)
  col?: number;                         // flat grid column
  /** The text holds a spreadsheet's stored values in place of `rounded`
   *  cells it showed rounded (clipboardHtml.ts). */
  fullValues?: { app: SheetApp; rounded: number };
}

type Tab = "source" | "view" | "filter" | "placement" | "recipes";
const TABS: [Tab, string][] = [
  ["source", "Source"], ["view", "View"], ["filter", "Filter"], ["placement", "Placement"],
  ["recipes", "Recipes"],
];

// Instrument-export recipes (src/share): a new table from a FlowJo,
// CellProfiler, QuPath, plate-reader, qPCR or long-format file.
const RecipeDialog = lazy(() => import("../../share/RecipeDialog"));
// Saved recipes: apply one, or save this dialog's settings as one.
const ImportRecipesBar = lazy(() => import("../../share/recipes/ImportRecipesBar"));

// "auto" reads the file as every picker does (lib/fileText.ts); the
// others override it.
const ENCODINGS: [string, string][] = [
  ["utf-8", "UTF-8"],
  ["windows-1252", "Windows-1252 / Latin-1"],
  ["utf-16le", "UTF-16"],
  ["utf-16be", "UTF-16 big-endian"],
  ["macintosh", "Mac Roman"],
];
const ENCODING_NAMES: Record<FileEncoding, string> = {
  "utf-8": "UTF-8", "windows-1252": "Windows-1252", "utf-16le": "UTF-16", "utf-16be": "UTF-16 big-endian",
};

const intOr = (v: string, d: number) => {
  const n = Math.round(Number(v));
  return v.trim() !== "" && Number.isFinite(n) ? n : d;
};

/**
 * Import delimited text or a spreadsheet into the current table, in four
 * steps: Source (file or pasted text, delimiter, decimal separator,
 * lines to skip, titles row), View (what each column becomes), Filter
 * (rows / columns to keep, every k-th row, missing-value code, rows with
 * a blank X, trailing * = excluded) and Placement (replace, append or
 * write at a cell; transpose; values per dataset).
 */
export default function ImportDialog({ table, initial, onImport, onPasteAsIs, onClose }: {
  table: DataTableModel;
  initial?: ImportRequest;
  /** The edit, and what it does to every cell it writes (the report the
   *  grid shows above the table). */
  onImport: (fn: (t: DataTableModel) => DataTableModel, report?: PasteReport) => void;
  onPasteAsIs?: () => void;
  onClose: () => void;
}) {
  const shape = tableShape(table.type);
  const [tab, setTab] = useState<Tab>("source");
  const uid = useId();
  const [srcKind, setSrcKind] = useState<"file" | "paste">(initial?.text ? "paste" : "file");
  const [pasted, setPasted] = useState(initial?.text ?? "");
  const largeLines = useMemo(() => largePasteLines(pasted), [pasted]);
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [encoding, setEncoding] = useState("auto");
  const [sheets, setSheets] = useState<XlsxSheet[] | null>(null);
  const [sheetIx, setSheetIx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [src, setSrc] = useState<SourceOptions>(DEFAULT_SOURCE);
  const [filter, setFilter] = useState<FilterOptions>(DEFAULT_FILTER);
  const [roleOverride, setRoleOverride] = useState<Record<number, ColumnRole>>({});
  // Several files or a zip (stacked by the recipe dialog), and a saved
  // recipe chosen from the list.
  const [recipeFiles, setRecipeFiles] = useState<File[] | undefined>(undefined);
  const [savedRecipe, setSavedRecipe] = useState<string | undefined>(undefined);
  const firstY = flatColumns(table).findIndex((c) => c.kind === "y");
  const defaultMode: PlacementOptions["mode"] = initial?.mode
    ?? (hasAnyValue(table) ? "append" : "replace");
  const [place, setPlace] = useState<PlacementOptions>({
    mode: defaultMode,
    row: initial?.row ?? 0,
    col: Math.max(firstY, initial?.col ?? firstY),
    perDataset: Math.max(1, table.datasets[0]?.rows[0]?.length ?? 1),
    useTitles: true,
  });

  const isXlsx = !!sheets;
  const detected = useMemo(() => (file && !isXlsx ? detectEncoding(file.bytes) : null), [file, isXlsx]);
  const text = useMemo(() => {
    if (srcKind === "paste") return pasted;
    if (!file || isXlsx) return "";
    try { return decodeAs(file.bytes, encoding === "auto" ? detected ?? "utf-8" : encoding); } catch { return ""; }
  }, [srcKind, pasted, file, encoding, isXlsx, detected]);

  // Rows hidden in Excel: by a filter, left out unless kept; by hand, kept
  // unless left out (as copying the range in Excel does).
  const [keepFiltered, setKeepFiltered] = useState(false);
  const [skipHidden, setSkipHidden] = useState(false);
  const sheet = srcKind === "file" && sheets ? sheets[sheetIx] ?? null : null;
  const source: string | string[][] = useMemo(() => (sheet
    ? visibleRows(sheet, keepFiltered, skipHidden) : text), [sheet, keepFiltered, skipHidden, text]);
  // "First row holds column titles" follows the data until the user
  // ticks or unticks it: text above columns of numbers is a titles row.
  const [titlesTouched, setTitlesTouched] = useState(false);
  // The source is split into fields once per text, delimiter and lines to
  // skip; the titles check and the preview both read that one parse.
  const matrix = useMemo(() => sourceMatrix(source, src),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these two settings change the parse
    [source, src.delimiter, src.skipLines]);
  const detectedTitles = useMemo(() => detectTitlesRowIn(matrix, src), [matrix, src]);
  const effSrc = useMemo(() => (titlesTouched ? src : { ...src, titlesRow: detectedTitles }),
    [src, titlesTouched, detectedTitles]);
  const preview = useMemo(() => prepareFromMatrix(matrix, effSrc, filter), [matrix, effSrc, filter]);
  const defaults = useMemo(() => defaultRoles(table, preview), [table, preview]);
  const roles: ColumnRole[] = preview.columns.map((c, i) => roleOverride[c] ?? defaults[i]);
  const empty = preview.rows.length === 0 || preview.columns.length === 0;
  const yCount = roles.filter((r) => r === "y").length;
  const width = importWidth(table, place.perDataset);

  const pickFile = async (f: File | undefined) => {
    setError("");
    setSheets(null);
    setSheetIx(0);
    setRoleOverride({});
    setKeepFiltered(false);
    setSkipHidden(false);
    if (!f) { setFile(null); return; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    setFile({ name: f.name, bytes });
    if (/\.xlsx$/i.test(f.name)) {
      setBusy(true);
      try {
        const s = await readXlsx(bytes);
        if (!s.length) throw new Error("the workbook has no worksheets");
        setSheets(s);
      } catch (e) {
        setError(`Could not read the workbook: ${e instanceof Error ? e.message : String(e)}`);
      } finally { setBusy(false); }
    } else if (/\.(xls|ods|numbers)$/i.test(f.name)) {
      setError("Only .xlsx workbooks can be read. Save the sheet as .xlsx or CSV, or copy and paste it.");
    }
  };

  const takeFiles = (list: File[]) => {
    if (list.length > 1 || isTableDrop(list)) { setRecipeFiles(list); setTab("recipes"); return; }
    void pickFile(list[0]);
  };

  const readClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setPasted(t);
      setRoleOverride({});
    } catch {
      setError("The browser did not allow reading the clipboard; paste into the box instead (Ctrl/Cmd+V).");
    }
  };

  if (tab === "recipes") {
    return (
      <Suspense fallback={null}>
        <RecipeDialog initialText={srcKind === "paste" ? pasted : undefined}
          initialFiles={recipeFiles} savedId={savedRecipe}
          onBack={() => { setRecipeFiles(undefined); setSavedRecipe(undefined); setTab("source"); }}
          onClose={onClose} />
      </Suspense>
    );
  }

  const submit = () => {
    if (empty) { setError("Nothing to import: these settings leave no rows or columns. Check the Source and Filter tabs."); return; }
    const f = { skipBlankX: filter.skipBlankX, asteriskExcluded: filter.asteriskExcluded };
    const res = applyImportWithCells(table, preview, roles, place, f);
    // the table built for the report is the edit's result whenever the
    // table has not changed since (a large import is built once, not twice)
    onImport((t) => (t === table ? res.table : applyImport(t, preview, roles, place, f)),
      pasteReport(placedCells(res.table, res.written)));
  };

  const num = (label: string, value: number | null, set: (v: number | null) => void,
    opts: { min?: number; blank?: string } = {}) => (
      <NumberField label={label} fieldClassName="field-num" integer min={opts.min ?? 0}
        value={value === null ? "" : String(value)} placeholder={opts.blank}
        onValueChange={(v) => set(v.trim() === ""
          ? null : Math.max(opts.min ?? 0, intOr(v, opts.min ?? 0)))} />
  );

  const roleLabel = (r: ColumnRole) => r === "x" ? "X" : r === "y" ? "Y"
    : r === "rowTitle" ? "Row titles" : "Skip";
  const roleChoices: ColumnRole[] = [
    ...(shape.hasX ? ["x" as const] : []),
    "y",
    ...(shape.hasRowTitles ? ["rowTitle" as const] : []),
    "ignore",
  ];

  const where = place.mode === "replace" ? "replacing the table's values"
    : place.mode === "append" ? "below the last row"
      : `from row ${place.row + 1}, Y column ${place.col - firstY + 1}`;
  const datasetsNeeded = Math.ceil(yCount / Math.max(1, width));

  return (
    <Modal title="Import data" className="modal-wide import-dialog" onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          {onPasteAsIs && (
            <Button className="spacer" onClick={onPasteAsIs}>Paste as is</Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Reading…"
            disabled={!busy && empty}>Import</Button>
        </>
      }>
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Import steps">
          {TABS.map(([id, label]) => <Tabs.Tab key={id} value={id}>{label}</Tabs.Tab>)}
        </Tabs.List>

        <Tabs.Panel value="source"
          onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setSrcKind("file");
            takeFiles([...e.dataTransfer.files]);
          }}>
          <fieldset className="field-radios">
            <legend>Read from</legend>
            <label><input type="radio" name="imp-src" checked={srcKind === "file"}
              onChange={() => setSrcKind("file")} /> A file (CSV, TSV, text or .xlsx)</label>
            <label><input type="radio" name="imp-src" checked={srcKind === "paste"}
              onChange={() => setSrcKind("paste")} /> Pasted text</label>
          </fieldset>
          {srcKind === "file" ? (
            <div className="field-row">
              <div className="field">
                <span className="ui-field-label">File</span>
                <span className="import-file-row">
                  <FileButton multiple inputLabel="File to import" onFiles={takeFiles}
                    accept=".csv,.tsv,.txt,.tab,.dat,.prn,.xlsx,.zip,text/csv,text/plain,application/zip">
                    Choose a file…</FileButton>
                  <span className="import-file-name" title={file?.name}>
                    {file ? file.name : "CSV, TSV, text, .xlsx or .zip"}</span>
                </span>
              </div>
              {sheets && sheets.length > 1 && (
                <Field label="Worksheet" id={`${uid}-sheet`}>
                  <select id={`${uid}-sheet`} value={sheetIx} onChange={(e) => { setSheetIx(Number(e.target.value)); setRoleOverride({}); }}>
                    {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              {!isXlsx && (
                <Field label="Text encoding" id={`${uid}-enc`}>
                  <select id={`${uid}-enc`} value={encoding} onChange={(e) => setEncoding(e.target.value)}>
                    <option value="auto">Detect{detected ? ` (${ENCODING_NAMES[detected]})` : ""}</option>
                    {ENCODINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              )}
            </div>
          ) : (
            <div className="field">
              {largeLines !== null ? (
                // A text box of this much text would take gigabytes of
                // browser memory (LARGE_PASTE_CHARS): say what is there.
                <>
                  <span className="ui-field-label">Text to import</span>
                  <p className="field-note" data-part="large-paste">
                    {largeLines.toLocaleString("en")} lines of text, too long to show here: the
                    preview below shows the first rows, and all of them are imported.{" "}
                    <button type="button" data-still className="linkish"
                      onClick={() => { setPasted(""); setRoleOverride({}); }}>Clear the text</button>
                    {" "}to paste or type other text.
                  </p>
                </>
              ) : (
                <>
                  <label className="ui-field-label" htmlFor={`${uid}-text`}>Text to import</label>
                  <textarea id={`${uid}-text`} rows={6} value={pasted} spellCheck={false}
                    autoCorrect="off" autoCapitalize="off"
                    placeholder={"Dose;Response\n0,1;98,5\n1;50,2"}
                    onChange={(e) => { setPasted(e.target.value); setRoleOverride({}); }} />
                  <span className="field-note">
                    Paste here, or <button type="button" data-still className="linkish"
                      onClick={() => { void readClipboard(); }}>read the clipboard</button>.
                  </span>
                </>
              )}
              {initial?.fullValues && pasted === initial.text && (
                <p className="field-note" role="status" data-part="rounded">
                  {initial.fullValues.rounded === 1 ? "1 cell was" : `${initial.fullValues.rounded} cells were`}
                  {" "}shown rounded in {initial.fullValues.app}; the full
                  {initial.fullValues.rounded === 1 ? " value is" : " values are"} used.
                </p>
              )}
            </div>
          )}
          {!isXlsx && (
            <div className="field-row">
              <Field label="Columns separated by" id={`${uid}-delim`}>
                <select id={`${uid}-delim`} value={src.delimiter}
                  onChange={(e) => { setSrc({ ...src, delimiter: e.target.value as DelimiterChoice }); setRoleOverride({}); }}>
                  <option value="auto">Detect{preview.delimiter && src.delimiter === "auto"
                    ? ` (${DELIMITER_LABELS[preview.delimiter]})` : ""}</option>
                  <option value="tab">Tab</option>
                  <option value="comma">Comma</option>
                  <option value="semicolon">Semicolon</option>
                  <option value="space">Spaces</option>
                </select>
              </Field>
              <Field label="Decimal separator" id={`${uid}-decimal`}>
                <select id={`${uid}-decimal`} value={src.decimal}
                  onChange={(e) => setSrc({ ...src, decimal: e.target.value as DecimalChoice })}>
                  <option value="auto">Detect ({preview.decimal === "," ? "comma" : "point"})</option>
                  <option value=".">Point (1.5)</option>
                  <option value=",">Comma (1,5)</option>
                </select>
              </Field>
            </div>
          )}
          <div className="field-row">
            {num("Lines to skip at the top", src.skipLines,
              (v) => { setSrc({ ...src, skipLines: v ?? 0 }); setRoleOverride({}); })}
            <label className="check-row">
              <input type="checkbox" checked={effSrc.titlesRow}
                onChange={(e) => { setTitlesTouched(true); setSrc({ ...src, titlesRow: e.target.checked }); }} />
              <span>First row (after skipped lines) holds column titles
                {!titlesTouched && detectedTitles && (
                  <span className="field-note titles-detected"> (detected: text above numbers)</span>
                )}</span>
            </label>
          </div>
          {!isXlsx && srcKind === "file" && (
            <p className="field-note">
              If accented letters or µ look wrong in the preview, the file was
              saved in another encoding: choose it under Text encoding.
            </p>
          )}
          <p className="field-note">
            Several files at once (or a .zip of them), such as one CSV per image, are stacked
            into one table by the Recipes step, with the file name as a column.
          </p>
          <Suspense fallback={null}>
            <ImportRecipesBar
              current={(): PlainSpec => ({ kind: "plain", source: effSrc, filter,
                roles: Object.fromEntries(Object.entries(roleOverride).map(([k, v]) => [String(k), v])),
                place: { mode: place.mode, perDataset: place.perDataset, useTitles: place.useTitles } })}
              onPlain={(spec) => {
                setSrc(spec.source);
                setTitlesTouched(true);
                setFilter(spec.filter);
                setRoleOverride(Object.fromEntries(Object.entries(spec.roles).map(([k, v]) => [Number(k), v])));
                setPlace({ ...place, mode: spec.place.mode, perDataset: spec.place.perDataset,
                  useTitles: spec.place.useTitles });
              }}
              onRecipe={(id) => { setSavedRecipe(id); setTab("recipes"); }} />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="view">
          <p className="field-note">
            Choose what each column becomes. Y columns fill the table&apos;s Y
            subcolumns left to right.
          </p>
        </Tabs.Panel>

        <Tabs.Panel value="filter">
          <div className="field-row">
            {num("First row", filter.rowFrom, (v) => setFilter({ ...filter, rowFrom: v ?? 1 }), { min: 1 })}
            {num("Last row", filter.rowTo, (v) => setFilter({ ...filter, rowTo: v }), { min: 1, blank: "last" })}
            {num("Keep every k-th row", filter.everyK, (v) => setFilter({ ...filter, everyK: v ?? 1 }), { min: 1 })}
          </div>
          <div className="field-row">
            {num("First column", filter.colFrom, (v) => { setFilter({ ...filter, colFrom: v ?? 1 }); setRoleOverride({}); }, { min: 1 })}
            {num("Last column", filter.colTo, (v) => { setFilter({ ...filter, colTo: v }); setRoleOverride({}); }, { min: 1, blank: "last" })}
            <Field label="Missing-value code" className="field-num">
              <Input value={filter.missingCode} placeholder="e.g. NA" autoComplete="off"
                spellCheck={false} onChange={(e) => setFilter({ ...filter, missingCode: e.target.value })} />
            </Field>
          </div>
          <p className="field-note">
            Rows count from the first row of data (after the titles row).
            &ldquo;Every k-th row&rdquo; imports one row, then skips k − 1.
          </p>
          {shape.hasX && (
            <label className="check-row">
              <input type="checkbox" checked={filter.skipBlankX}
                onChange={(e) => setFilter({ ...filter, skipBlankX: e.target.checked })} />
              <span>Skip rows whose X value is blank</span>
            </label>
          )}
          <label className="check-row">
            <input type="checkbox" checked={filter.asteriskExcluded}
              onChange={(e) => setFilter({ ...filter, asteriskExcluded: e.target.checked })} />
            <span>A value followed by * (12.5*) is imported as excluded</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!filter.unstack}
              onChange={(e) => {
                setFilter({ ...filter, unstack: e.target.checked ? { dataCol: 2, groupCol: 1 } : null });
                setRoleOverride({});
              }} />
            <span>Unstack indexed data (one row per value, with a column of group ids)</span>
          </label>
          {filter.unstack && (
            <div className="field-row">
              {num("Values in column", filter.unstack.dataCol,
                (v) => setFilter({ ...filter, unstack: { ...filter.unstack!, dataCol: v ?? 1 } }), { min: 1 })}
              {num("Group ids in column", filter.unstack.groupCol,
                (v) => setFilter({ ...filter, unstack: { ...filter.unstack!, groupCol: v ?? 1 } }), { min: 1 })}
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="placement">
          <fieldset className="field-radios">
            <legend>Put the values</legend>
            <label><input type="radio" name="imp-mode" checked={place.mode === "replace"}
              onChange={() => setPlace({ ...place, mode: "replace" })} />
              In place of the table&apos;s current values</label>
            <label><input type="radio" name="imp-mode" checked={place.mode === "append"}
              onChange={() => setPlace({ ...place, mode: "append" })} />
              Below the last row with values</label>
            <label><input type="radio" name="imp-mode" checked={place.mode === "insert"}
              onChange={() => setPlace({ ...place, mode: "insert" })} />
              Starting at a cell</label>
          </fieldset>
          {place.mode === "insert" && (
            <div className="field-row">
              {num("Row", place.row + 1, (v) => setPlace({ ...place, row: Math.max(0, (v ?? 1) - 1) }), { min: 1 })}
              {num("Y column", place.col - firstY + 1,
                (v) => setPlace({ ...place, col: firstY + Math.max(0, (v ?? 1) - 1) }), { min: 1 })}
            </div>
          )}
          {shape.hasSubcolumns && table.subcolumnFormat === "replicates" && table.type !== "nested" && (
            num("Y columns per dataset (replicates)", place.perDataset,
              (v) => setPlace({ ...place, perDataset: Math.max(1, Math.min(24, v ?? 1)) }), { min: 1 })
          )}
          <label className="check-row">
            <input type="checkbox" checked={src.transpose}
              onChange={(e) => { setSrc({ ...src, transpose: e.target.checked }); setRoleOverride({}); }} />
            <span>Transpose (rows of the source become columns)</span>
          </label>
          {effSrc.titlesRow && (
            <label className="check-row">
              <input type="checkbox" checked={place.useTitles}
                onChange={(e) => setPlace({ ...place, useTitles: e.target.checked })} />
              <span>Name {shape.datasetNoun.toLowerCase()}s{shape.hasX ? " and X" : ""} from the titles row</span>
            </label>
          )}
        </Tabs.Panel>
      </Tabs>

      <WorkbookReport sheet={sheet} keepFiltered={keepFiltered} skipHidden={skipHidden}
        onKeepFiltered={setKeepFiltered} onSkipHidden={setSkipHidden} />
      <div className="import-preview" role="region" tabIndex={0} aria-label="Preview of the data to import">
        {empty ? (
          <p className="import-summary import-empty">
            {busy ? "Reading the workbook…" : srcKind === "file"
              ? "Choose a file to see its columns here." : "Paste text above to see its columns here."}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="rn"><span className="sr-only">Row</span></th>
                {preview.columns.map((c, i) => (
                  <th key={c}>
                    <select aria-label={`Column ${c} becomes`} value={roles[i]}
                      onChange={(e) => setRoleOverride({ ...roleOverride, [c]: e.target.value as ColumnRole })}>
                      {roleChoices.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                  </th>
                ))}
              </tr>
              <tr>
                <td className="rn" />
                {preview.columns.map((c, i) => (
                  <th key={c} title={preview.titles?.[i] || `Column ${c}`}>
                    {preview.titles?.[i] || `Column ${c}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, tab === "view" ? 200 : 8).map((r, ri) => (
                <tr key={ri}>
                  <td className="rn">{ri + 1}</td>
                  {r.map((v, i) => <td key={i} className={`role-${roles[i]}`}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="import-summary" role="status">
        {empty ? "" : `${preview.rows.length} of ${preview.totalRows} rows, ${yCount} Y column${yCount === 1 ? "" : "s"}`
          + `${datasetsNeeded > 1 ? ` (${datasetsNeeded} ${shape.datasetNoun.toLowerCase()}s)` : ""}, ${where}.`}
      </p>
      {error && <p className="import-error" role="alert">{error}</p>}
    </Modal>
  );
}
