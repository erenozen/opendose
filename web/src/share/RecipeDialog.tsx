import { useEffect, useMemo, useState } from "react";
import { useProject } from "../app/context";
// factory -> registry -> sheets -> this dialog is a module cycle; addFamily
// is only called from an event handler, never while modules evaluate.
import { addFamily } from "../app/factory";
import Modal from "../components/Modal";
import { SRC } from "../guide/sources";
import { readXlsx, type XlsxSheet } from "../lib/engine";
import { DEFAULT_EXPORT, tableMatrix } from "../project/exportTable";
import { newId } from "../project/ids";
import { makeProject } from "../project/ops";
import type { DataTableModel, Project } from "../project/types";
import PlateMapEditor from "../sheets/assays/plate/PlateMapEditor";
import { stackTables, type NamedText, type StackResult } from "./recipes/multiFile";
import {
  compileTemplate, DELIMITERS, guessDelimiter, guessParts, nameParts, splittableColumns,
  templateParts, type NamePattern, type PatternPart,
} from "./recipes/pattern";
import { initialConfig, runPipeline, type RecipeConfig } from "./recipes/pipeline";
import {
  detectRecipe, paramValue, parseSource, RECIPES, recipeById, type Recipe, type RecipeId,
  type RecipeParams, type Staged,
} from "./recipes/presets";
import { readTableFiles } from "./recipes/readFiles";
import { configFromSpec, specFromConfig } from "./recipes/saved";
import { SaveRecipeForm } from "./recipes/SavedRecipes";
import { recipeLabel, useSavedRecipes } from "./recipes/useSavedRecipes";
import {
  AGG_LABELS, hierarchy, OUTPUT_LABELS, requirements, ROLE_LABELS, ROLES, unitsPerGroup,
  type AggFn, type OutputType, type Role, type Staging,
} from "./recipes/staging";
import { superplotFamily } from "./recipes/superplotGraphs";
import "./share.css";

type Tab = "source" | "columns" | "aggregate" | "output";
const TAB_LABELS: Record<Tab, string> = {
  source: "Source", columns: "Columns", aggregate: "Aggregate", output: "Table",
};
const OUTPUTS = Object.keys(OUTPUT_LABELS) as OutputType[];
const FNS = Object.keys(AGG_LABELS) as AggFn[];
const PART_ROLES: Role[] = ["group", "subject", "time", "level", "meta", "skip"];

/** Several files (or zips of them) stacked into one table. */
interface MultiSource { files: NamedText[]; stack: StackResult; skipped: string[] }

/**
 * Import with a recipe: read an instrument or analysis-software export,
 * stage it as typed long records (Source, Columns), aggregate up the
 * sampling hierarchy (Aggregate) and pivot it into a new data table of
 * the chosen type (Table). With `staged` the source step is skipped: the
 * Reshape dialog hands over a long table already in the project. Several
 * files at once (or a zip) are stacked with the file name as a column
 * (recipes/multiFile.ts). A mapping can be saved as a recipe and applied
 * to the next file (recipes/saved.ts). `fresh`: the table starts a new
 * project (from the start screen) instead of joining the open one.
 */
export default function RecipeDialog({ initialText, initialFiles, savedId, staged: given, title, fresh,
  onBack, onClose }: {
  initialText?: string;
  initialFiles?: File[];
  savedId?: string;
  staged?: Staged;
  title?: string;
  fresh?: boolean;
  onBack?: () => void;
  onClose: () => void;
}) {
  const { apply, select, replace, store } = useProject();
  const tabs: Tab[] = given ? ["columns", "aggregate", "output"] : ["source", "columns", "aggregate", "output"];
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [srcKind, setSrcKind] = useState<"file" | "paste">(initialText ? "paste" : "file");
  const [pasted, setPasted] = useState(initialText ?? "");
  const [fileText, setFileText] = useState("");
  const [sheets, setSheets] = useState<XlsxSheet[] | null>(null);
  const [sheetIx, setSheetIx] = useState(0);
  const [multi, setMulti] = useState<MultiSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<string>(savedId ? `saved:${savedId}` : "auto");
  const [paramsBy, setParamsBy] = useState<Partial<Record<RecipeId, RecipeParams>>>({});
  const [saving, setSaving] = useState(false);
  const saved = useSavedRecipes();
  const savedEntry = choice.startsWith("saved:")
    ? saved.list.find((e) => e.recipe.id === choice.slice(6)) : undefined;
  const savedSpec = savedEntry?.spec.kind === "recipe" ? savedEntry.spec : undefined;

  const matrix = useMemo<string[][]>(() => {
    if (given) return [];
    if (srcKind === "file" && multi) return multi.stack.matrix;
    if (srcKind === "file" && sheets) return (sheets[sheetIx]?.rows ?? []).map((r) => r.map((c) => c.trim()));
    const text = srcKind === "paste" ? pasted : fileText;
    return text.trim() ? parseSource(text) : [];
  }, [given, srcKind, multi, sheets, sheetIx, pasted, fileText]);

  const isMulti = srcKind === "file" && !!multi;
  const detected = useMemo(() => (matrix.length
    ? (isMulti ? recipeById("images") : detectRecipe(matrix)) : null), [matrix, isMulti]);
  const recipe: Recipe | null = savedSpec ? recipeById(savedSpec.recipe)
    : choice === "auto" || choice.startsWith("saved:") ? detected : recipeById(choice as RecipeId);
  const params: RecipeParams = useMemo(() => ({
    ...(savedSpec?.params ?? {}), ...(recipe ? paramsBy[recipe.id] ?? {} : {}),
  }), [savedSpec, recipe, paramsBy]);
  const paramsKey = JSON.stringify(params);
  const stagedResult = useMemo((): { staged: Staged | null; error: string } => {
    if (given) return { staged: given, error: "" };
    if (!recipe || !matrix.length) return { staged: null, error: "" };
    try {
      return { staged: recipe.stage(matrix, JSON.parse(paramsKey) as RecipeParams), error: "" };
    } catch (e) {
      return { staged: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [given, recipe, matrix, paramsKey]);
  const staged = stagedResult.staged;

  // The configuration starts from the recipe's proposal (and a saved
  // recipe's settings) and is reset when the file or the recipe changes.
  const [cfgState, setCfgState] = useState<{ for: Staged; cfg: RecipeConfig } | null>(null);
  const startCfg = useMemo((): RecipeConfig | null => {
    if (!staged) return null;
    const p = JSON.parse(paramsKey) as RecipeParams;
    const base = { ...initialConfig(staged), params: p };
    return savedSpec ? { ...configFromSpec(staged, base, savedSpec), params: p } : base;
  }, [staged, savedSpec, paramsKey]);
  const cfg = staged ? (cfgState?.for === staged ? cfgState.cfg : startCfg) : null;
  const setCfg = (patch: Partial<RecipeConfig>) => {
    if (staged && cfg) setCfgState({ for: staged, cfg: { ...cfg, ...patch } });
  };

  const out = useMemo(() => (staged && cfg
    ? runPipeline(staged.staging, cfg, { wellColumn: staged.wells?.column, yTitle: staged.yTitle })
    : null), [staged, cfg]);

  const pickFile = async (f: File | undefined) => {
    setError("");
    setSheets(null);
    setSheetIx(0);
    setFileText("");
    setMulti(null);
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (/\.xlsx$/i.test(f.name)) {
      setBusy(true);
      try {
        const s = await readXlsx(bytes);
        if (!s.length) throw new Error("the workbook has no worksheets");
        setSheets(s);
      } catch (e) {
        setError(`Could not read the workbook: ${e instanceof Error ? e.message : String(e)}`);
      } finally { setBusy(false); }
    } else {
      setFileText(new TextDecoder("utf-8").decode(bytes));
    }
  };

  // Several files, or a zip: stacked with the file name as a column.
  const pickFiles = async (list: File[]) => {
    if (list.length <= 1 && !/\.zip$/i.test(list[0]?.name ?? "")) { await pickFile(list[0]); return; }
    setError("");
    setSheets(null);
    setFileText("");
    setBusy(true);
    try {
      const r = await readTableFiles(list);
      if (!r.files.length) {
        setMulti(null);
        setError("No CSV, TSV or text files were found among the files chosen.");
      } else {
        setMulti({ files: r.files, stack: stackTables(r.files), skipped: r.skipped });
      }
    } catch (e) {
      setError(`Could not read the files: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (initialFiles?.length) void pickFiles(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = () => {
    if (!out?.result || !cfg) return;
    const name = cfg.name.trim() || "Imported data";
    const lower = out.lower;
    const lowerName = out.subject >= 0
      ? `${name} (every value by ${out.records.columns[out.subject].name})` : `${name} (all values)`;
    const mapped = !!out.replicates;
    const build = (p: Project): { project: Project; dataId: string } => {
      const r = addFamily(p, out.result!.table, name, newId);
      let q = mapped ? superplotFamily(r.project, r.dataId) : r.project;
      if (lower) q = addFamily(q, lower.table, lowerName, newId).project;
      return { project: q, dataId: r.dataId };
    };
    if (fresh) {
      const r = build(makeProject(store.project.prefs, [], name));
      replace(r.project, r.dataId);
    } else {
      let first = "";
      apply((p: Project) => {
        const r = build(p);
        first = r.dataId;
        return r.project;
      });
      if (first) select(first);
    }
    onClose();
  };

  const saveRecipe = (name: string, inProject: boolean) => {
    if (!staged || !cfg) return "Choose a file first.";
    const spec = specFromConfig(staged, { ...cfg, params }, isMulti);
    return saved.save(name, spec, recipeLabel(staged.recipe), inProject);
  };

  const n = staged?.staging.rows.length ?? 0;
  const summary = !staged ? ""
    : `${n} record${n === 1 ? "" : "s"}${out && cfg?.aggregate && out.steps.length
      ? ` → ${out.aggregated.rows.length} after aggregation` : ""}`;
  const recipeSaved = saved.list.filter((e) => e.spec.kind === "recipe");

  return (
    <Modal title={title ?? "Import with a recipe"} className="modal-wide recipe-dialog"
      onClose={onClose} onSubmit={create}
      actions={
        <>
          {onBack && <button type="button" className="spacer" onClick={onBack}>Back to plain import</button>}
          {!given && (
            <button type="button" className={onBack ? undefined : "spacer"} disabled={!staged}
              aria-expanded={saving} onClick={() => setSaving(!saving)}>Save as recipe…</button>
          )}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!out?.result || busy}>
            Create table
          </button>
        </>
      }>
      <div className="dialog-tabs" role="tablist" aria-label="Recipe steps">
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" id={`rcp-tab-${id}`}
            aria-selected={tab === id} aria-controls={`rcp-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = tabs.indexOf(tab);
              const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
              setTab(next);
              requestAnimationFrame(() => document.getElementById(`rcp-tab-${next}`)?.focus());
            }}
            onClick={() => setTab(id)}>{TAB_LABELS[id]}</button>
        ))}
      </div>

      {saving && staged && (
        <SaveRecipeForm defaultName={savedEntry?.recipe.name ?? staged.name}
          onSave={saveRecipe} onCancel={() => setSaving(false)} />
      )}

      {tab === "source" && !given && (
        <div className="dialog-panel" role="tabpanel" id="rcp-panel-source" aria-labelledby="rcp-tab-source">
          <fieldset className="field-radios">
            <legend>Read from</legend>
            <label><input type="radio" name="rcp-src" checked={srcKind === "file"}
              onChange={() => setSrcKind("file")} /> A file (CSV, TSV, text or .xlsx), several files or a .zip</label>
            <label><input type="radio" name="rcp-src" checked={srcKind === "paste"}
              onChange={() => setSrcKind("paste")} /> Pasted text</label>
          </fieldset>
          {srcKind === "file" ? (
            <div className="field-row">
              <label className="field">
                <span>File (or several)</span>
                <input type="file" aria-label="Export file to import" multiple
                  accept=".csv,.tsv,.txt,.tab,.dat,.xlsx,.zip,text/csv,text/plain,application/zip"
                  onChange={(e) => { void pickFiles([...(e.target.files ?? [])]); }} />
              </label>
              {sheets && sheets.length > 1 && (
                <label className="field">
                  <span>Worksheet</span>
                  <select value={sheetIx} onChange={(e) => setSheetIx(Number(e.target.value))}>
                    {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <label className="field">
              <span>Text to import</span>
              <textarea rows={5} value={pasted} spellCheck={false} aria-label="Export text to import"
                onChange={(e) => setPasted(e.target.value)} />
            </label>
          )}
          {isMulti && multi && (
            <p className="field-note" role="status" aria-label="Files stacked">
              {multi.stack.files} files stacked into one table of {multi.stack.matrix.length - 1} rows,
              with the file name in a “File” column.
              {multi.stack.empty.length > 0 && ` ${multi.stack.empty.length} file(s) had no rows: `
                + `${multi.stack.empty.slice(0, 4).join(", ")}${multi.stack.empty.length > 4 ? " …" : ""}.`}
              {multi.stack.differing.length > 0 && ` ${multi.stack.differing.length} file(s) have other columns `
                + "than the first; columns were matched by title."}
              {multi.skipped.length > 0 && ` Not read (not a table file): ${multi.skipped.slice(0, 4).join(", ")}.`}
            </p>
          )}
          <fieldset className="recipe-list">
            <legend>Recipe</legend>
            <RecipeOption checked={choice === "auto"} onChange={() => setChoice("auto")}
              label="Recognise the file"
              desc={detected ? `Looks like: ${detected.label}.` : "Choose a file to recognise its format."} />
            {RECIPES.map((r) => (
              <RecipeOption key={r.id} checked={choice === r.id} onChange={() => setChoice(r.id)}
                label={r.label} desc={r.description} layouts={r.layouts}
                badge={detected?.id === r.id ? "detected" : ""} />
            ))}
          </fieldset>
          {recipeSaved.length > 0 && (
            <fieldset className="recipe-list" aria-label="Saved recipes">
              <legend>Saved recipes</legend>
              {recipeSaved.map((e) => (
                <div key={e.recipe.id} className="recipe-saved-row">
                  <RecipeOption checked={choice === `saved:${e.recipe.id}`}
                    onChange={() => setChoice(`saved:${e.recipe.id}`)}
                    label={e.recipe.name} desc={e.description}
                    badge={e.inProject ? "in project" : "this browser"} />
                  <button type="button" className="linkish" aria-label={`Delete saved recipe ${e.recipe.name}`}
                    onClick={() => {
                      if (choice === `saved:${e.recipe.id}`) setChoice("auto");
                      saved.remove(e.recipe.id);
                    }}>Delete</button>
                </div>
              ))}
            </fieldset>
          )}
          {recipe?.params && (
            <div className="field-row" aria-label={`${recipe.label} settings`} role="group">
              {recipe.params.map((p) => {
                const value = paramValue(recipe, params, p.key);
                const set = (v: string) => setParamsBy({ ...paramsBy,
                  [recipe.id]: { ...(paramsBy[recipe.id] ?? {}), [p.key]: v } });
                return p.kind === "select" ? (
                  <label key={p.key} className="field">
                    <span>{p.label}</span>
                    <select value={value} onChange={(e) => set(e.target.value)}>
                      {p.choices?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                ) : (
                  <label key={p.key} className="field field-num" title={p.note}>
                    <span>{p.label}</span>
                    <input inputMode="decimal" value={value} placeholder={p.placeholder}
                      onChange={(e) => set(e.target.value)} />
                  </label>
                );
              })}
            </div>
          )}
          {recipe?.params?.some((p) => p.note) && (
            <p className="field-note">{recipe.params.filter((p) => p.note).map((p) => p.note).join(" ")}</p>
          )}
          {staged?.notes.map((t, i) => <p key={i} className="field-note">{t}</p>)}
        </div>
      )}

      {tab === "columns" && staged && cfg && (
        <div className="dialog-panel" role="tabpanel" id="rcp-panel-columns" aria-labelledby="rcp-tab-columns">
          <p className="field-note">
            Say what each column holds. Group and Value are needed for most
            tables; Subject marks the experimental unit (animal, donor,
            biological replicate); hierarchy levels are the units in between
            (cell, image, well) that aggregation averages over.
          </p>
          <div className="recipe-roles">
            {staged.staging.columns.map((c, i) => (
              <label key={i} className="field">
                <span title={c.name}>{c.name} <small className="role-chip">{c.numeric ? "numbers" : "text"}</small></span>
                <select value={cfg.roles[i]} aria-label={`Column ${c.name} holds`}
                  onChange={(e) => {
                    const roles = [...cfg.roles];
                    roles[i] = e.target.value as Role;
                    setCfg({ roles });
                  }}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </label>
            ))}
          </div>
          <PatternBuilder staging={staged.staging} pattern={cfg.pattern}
            onChange={(pattern) => {
              // Aggregation steps name their level: follow a renamed part.
              const steps = cfg.steps.map((s) => {
                const i = cfg.pattern?.parts.findIndex((p) => p.role !== "skip" && p.name === s.level) ?? -1;
                const now = i >= 0 ? pattern?.parts[i] : undefined;
                return now && now.role !== "skip" ? { ...s, level: now.name } : s;
              });
              setCfg({ pattern, steps });
            }} />
          {staged.wells && (
            <section className="dialog-panel recipe-platemap" aria-label="Plate map">
              <label className="field-check">
                <input type="checkbox" checked={!!cfg.plateMap}
                  onChange={(e) => setCfg({ plateMap: e.target.checked ? {} : null })} />
                Group the wells with a plate map (wells of a group become its replicates; wells
                left empty are not imported)
              </label>
              {cfg.plateMap && (
                <PlateMapEditor format={staged.wells.format} wells={cfg.plateMap} unit="units"
                  onChange={(plateMap) => setCfg({ plateMap })} />
              )}
            </section>
          )}
        </div>
      )}

      {tab === "aggregate" && staged && cfg && out && (
        <AggregatePanel cfg={cfg} records={out.records} onChange={setCfg}
          units={unitsPerGroup(out.aggregated, out.subject)}
          subjectName={out.subject >= 0 ? out.records.columns[out.subject].name : ""} />
      )}

      {tab === "output" && staged && cfg && (
        <div className="dialog-panel" role="tabpanel" id="rcp-panel-output" aria-labelledby="rcp-tab-output">
          <fieldset className="field-radios">
            <legend>Make a table of type</legend>
            {OUTPUTS.map((o) => (
              <label key={o}>
                <input type="radio" name="rcp-out" checked={cfg.output === o}
                  onChange={() => setCfg({ output: o })} />
                {OUTPUT_LABELS[o]}
              </label>
            ))}
          </fieldset>
          {requirements(cfg.output) && (
            <p className="field-note">This table type uses {requirements(cfg.output)}.</p>
          )}
          {(cfg.output === "column" || cfg.output === "grouped") && (
            <div className="recipe-replicates">
              <label className="field-check">
                <input type="checkbox" checked={!!cfg.replicateMap}
                  onChange={(e) => setCfg({ replicateMap: e.target.checked })} />
                Keep every value and mark which experiment it comes from (replicate map for
                SuperPlots and statistics on replicate means)
              </label>
              {cfg.replicateMap && (
                <p className="field-note" role="status" aria-label="Replicate map">
                  {out?.replicates
                    ? <>Replicate map: {out.replicates.experiments} independent experiments
                      (from {out.replicates.column}); each value is one {singular(out.replicates.unit)}.
                      The graph opens as a SuperPlot and the legend reports n with the experiments.{" "}</>
                    : <>Mark a Subject / replicate column (or read one from the names) that is not the
                      last level aggregated into.{" "}</>}
                  <a href={SRC.lord2020.url} target="_blank" rel="noreferrer">{SRC.lord2020.label}</a>
                </p>
              )}
            </div>
          )}
          <label className="field">
            <span>Table name</span>
            <input value={cfg.name} onChange={(e) => setCfg({ name: e.target.value })} />
          </label>
        </div>
      )}

      {!staged && tab !== "source" && (
        <p className="field-note">Choose a file or paste an export on the Source step first.</p>
      )}

      {out && (tab === "aggregate" || tab === "output")
        ? out.result && <TablePreview table={out.result.table} />
        : out && <StagingPreview staging={out.records} />}

      <p className="import-summary" role="status">
        {summary}
        {out?.result && (
          <>
            {" · "}{out.result.table.datasets.length} {out.result.table.type === "multivariable"
              ? "variables" : "datasets"}:{" "}
          </>
        )}
      </p>
      {out?.result && cfg?.output !== "multivariable" && (
        <ul className="recipe-counts" aria-label="Values per dataset">
          {out.result.counts.slice(0, 24).map((c, i) => (
            <li key={i}>{c.name} <b>n = {c.n}</b></li>
          ))}
          {out.result.counts.length > 24 && <li>… {out.result.counts.length - 24} more</li>}
        </ul>
      )}
      {(out?.error || stagedResult.error || error) && (
        <p className="import-error" role="alert">{out?.error || stagedResult.error || error}</p>
      )}
    </Modal>
  );
}

function singular(unit: string): string {
  if (unit === "values") return "value";
  return unit.endsWith("s") ? unit.slice(0, -1) : unit;
}

function RecipeOption({ checked, onChange, label, desc, layouts, badge }: {
  checked: boolean; onChange: () => void; label: string; desc: string; layouts?: string; badge?: string;
}) {
  return (
    <label className={`recipe-option${checked ? " checked" : ""}`}>
      <input type="radio" name="rcp-recipe" checked={checked} onChange={onChange} />
      <span>
        <b>{label}{badge && <span className="recipe-detected">{badge}</span>}</b>
        <small>{desc}</small>
        {layouts && <small className="recipe-layouts">Recognises: {layouts}</small>}
      </span>
    </label>
  );
}

/** Name pattern builder: a file-name template ("{condition}_rep{replicate}
 *  _img{image}.csv") or delimiter and position pickers, with a live
 *  preview of the first names split into parts. */
function PatternBuilder({ staging, pattern, onChange }: {
  staging: Staging;
  pattern: NamePattern | null;
  onChange: (p: NamePattern | null) => void;
}) {
  const candidates = splittableColumns(staging);
  const names = (c: number) => staging.rows.map((r) => r[c] ?? "");
  const start = (c: number): NamePattern => {
    const delimiter = guessDelimiter(names(c));
    return { column: c, delimiter, stripExtension: true, parts: guessParts(names(c), delimiter, true) };
  };
  const set = (patch: Partial<NamePattern>) => {
    if (!pattern) return;
    const next = { ...pattern, ...patch };
    if (next.template === undefined && (patch.delimiter !== undefined || patch.stripExtension !== undefined
      || patch.column !== undefined)) {
      // re-split: keep roles already chosen by position
      const fresh = guessParts(names(next.column), next.delimiter, next.stripExtension);
      next.parts = fresh.map((p, i) => pattern.parts[i] ?? p);
    }
    onChange(next);
  };
  const setTemplate = (template: string | undefined) => {
    if (!pattern) return;
    if (template === undefined) {
      const fresh = start(pattern.column);
      onChange({ ...fresh, column: pattern.column });
      return;
    }
    const parts = templateParts(template);
    onChange({ ...pattern, template,
      parts: parts.map((p, i) => (pattern.parts[i]?.name === p.name ? pattern.parts[i] : p)) });
  };
  const setPart = (i: number, patch: Partial<PatternPart>) => {
    if (!pattern) return;
    onChange({ ...pattern, parts: pattern.parts.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  };
  const custom = pattern && !DELIMITERS.some(([d]) => d === pattern.delimiter);
  const all = pattern ? distinctFirst(names(pattern.column), Infinity) : [];
  const sample = all.slice(0, 5);
  const isTemplate = pattern?.template !== undefined;
  const compiled = isTemplate ? compileTemplate(pattern!.template!) : null;
  const fits = pattern && isTemplate ? all.filter((nm) => nameParts(nm, pattern).length > 0).length : 0;

  return (
    <section className="dialog-panel" aria-label="Name pattern">
      <label className="field-check">
        <input type="checkbox" checked={!!pattern} disabled={!candidates.length && !pattern}
          onChange={(e) => onChange(e.target.checked ? start(candidates[0] ?? 0) : null)} />
        Read group, subject or time from the parts of a name
        {!candidates.length && !pattern && " (no text column with separators)"}
      </label>
      {pattern && (
        <>
          <div className="field-row">
            <label className="field">
              <span>Names in column</span>
              <select value={pattern.column} onChange={(e) => set({ column: Number(e.target.value) })}>
                {staging.columns.map((c, i) => (!c.numeric || i === pattern.column) && (
                  <option key={i} value={i}>{c.name}</option>
                ))}
              </select>
            </label>
            <fieldset className="field-radios">
              <legend>Read the parts</legend>
              <label><input type="radio" name="rcp-pattern-mode" checked={!isTemplate}
                onChange={() => setTemplate(undefined)} /> Split at a separator</label>
              <label><input type="radio" name="rcp-pattern-mode" checked={isTemplate}
                onChange={() => setTemplate("{condition}_rep{replicate}_img{image}.csv")} /> With a name template</label>
            </fieldset>
          </div>
          {isTemplate ? (
            <div className="field-row">
              <label className="field recipe-template">
                <span>Name template</span>
                <input value={pattern.template} spellCheck={false} aria-label="Name template"
                  onChange={(e) => setTemplate(e.target.value)} />
              </label>
              <p className="field-note" role="status">
                {compiled
                  ? `${fits} of ${all.length} names fit. {field} reads a part; {*} skips one.`
                  : "Put each part in braces: {condition}_rep{replicate}_img{image}.csv"}
              </p>
            </div>
          ) : (
            <div className="field-row">
              <label className="field">
                <span>Parts separated by</span>
                <select value={custom ? "custom" : pattern.delimiter}
                  onChange={(e) => set({ delimiter: e.target.value === "custom" ? "~" : e.target.value })}>
                  {DELIMITERS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
                  <option value="custom">Other…</option>
                </select>
              </label>
              {custom && (
                <label className="field field-num">
                  <span>Separator</span>
                  <input value={pattern.delimiter} aria-label="Custom separator"
                    onChange={(e) => set({ delimiter: e.target.value })} />
                </label>
              )}
              <label className="field-check">
                <input type="checkbox" checked={pattern.stripExtension}
                  onChange={(e) => set({ stripExtension: e.target.checked })} />
                Ignore the file extension (.fcs, .tif …)
              </label>
            </div>
          )}
          <div className="pattern-tokens">
            {pattern.parts.map((p, i) => (
              <div key={i} className="pattern-token">
                <span>Part {i + 1}: <code>{nameParts(sample[0] ?? "", pattern)[i] ?? "—"}</code></span>
                <select value={p.role} aria-label={`Part ${i + 1} is`}
                  onChange={(e) => {
                    const role = e.target.value as Role;
                    const auto = p.name === ROLE_LABELS[p.role].split(" ")[0] || /^Part \d+$/.test(p.name)
                      || p.name === "Level";
                    setPart(i, { role, name: auto ? partName(role, i) : p.name });
                  }}>
                  {PART_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                {p.role !== "skip" && (
                  <input value={p.name} aria-label={`Part ${i + 1} column name`}
                    onChange={(e) => setPart(i, { name: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div className="import-preview" aria-label="How the names split">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  {pattern.parts.map((p, i) => (
                    <th key={i} className={`role-${p.role}`}>{p.role === "skip" ? `(skip ${i + 1})` : p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((nm, r) => {
                  const parts = nameParts(nm, pattern);
                  return (
                    <tr key={r}>
                      <td>{nm}</td>
                      {isTemplate && !parts.length
                        ? <td colSpan={Math.max(1, pattern.parts.length)} className="dim">does not fit the template</td>
                        : pattern.parts.map((p, i) => (
                          <td key={i} className={p.role === "skip" ? "dim" : undefined}>{parts[i] ?? ""}</td>
                        ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function partName(role: Role, i: number): string {
  switch (role) {
    case "group": return "Group";
    case "subject": return "Subject";
    case "time": return "Time";
    case "level": return "Level";
    default: return `Part ${i + 1}`;
  }
}

function distinctFirst(values: string[], n: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) { seen.add(v); out.push(v); }
    if (out.length >= n) break;
  }
  return out;
}

/** Hierarchical aggregation: which levels to average (or count, sum,
 *  take the median of) into, finest first. */
function AggregatePanel({ cfg, records, units, subjectName, onChange }: {
  cfg: RecipeConfig;
  records: Staging;
  units: { name: string; n: number }[];
  subjectName: string;
  onChange: (patch: Partial<RecipeConfig>) => void;
}) {
  const levels = hierarchy(records).map((c) => records.columns[c].name);
  // Every candidate, finest first, then "rows sharing group and time".
  const candidates = [...levels, ""];
  const active = new Map(cfg.steps.map((s) => [s.level, s.fn]));
  const setSteps = (next: Map<string, AggFn>) => onChange({
    steps: candidates.filter((c) => next.has(c)).map((c) => ({ level: c, fn: next.get(c)! })),
  });
  return (
    <div className="dialog-panel" role="tabpanel" id="rcp-panel-aggregate" aria-labelledby="rcp-tab-aggregate">
      <label className="field-check">
        <input type="checkbox" checked={cfg.aggregate}
          onChange={(e) => onChange({ aggregate: e.target.checked })} />
        Aggregate before making the table
      </label>
      <p className="field-note">
        Statistics should count experimental units (animals, donors,
        independent experiments), not cells or images. Combine the records
        level by level, finest first: for example the mean of the cells in
        each image, then the mean of the images of each animal.
      </p>
      {cfg.aggregate && (
        <div className="agg-steps">
          {candidates.map((c) => (
            <div key={c || "(rows)"} className="agg-step">
              <label className="field-check">
                <input type="checkbox" checked={active.has(c)}
                  onChange={(e) => {
                    const next = new Map(active);
                    if (e.target.checked) next.set(c, "mean"); else next.delete(c);
                    setSteps(next);
                  }} />
                {c ? <>One value per <b>{c}</b></> : <>One value per group and time / row (technical replicates)</>}
              </label>
              {active.has(c) && (
                <select value={active.get(c)} aria-label={`Combine into ${c || "one value per group and time"} by`}
                  onChange={(e) => {
                    const next = new Map(active);
                    next.set(c, e.target.value as AggFn);
                    setSteps(next);
                  }}>
                  {FNS.map((f) => <option key={f} value={f}>{AGG_LABELS[f]}</option>)}
                </select>
              )}
            </div>
          ))}
          {!levels.length && (
            <p className="field-note">
              No subject or hierarchy-level column yet: mark one on the Columns
              step (or read it from a name) to aggregate by it.
            </p>
          )}
          <label className="field-check">
            <input type="checkbox" checked={cfg.keepLower} disabled={!subjectName}
              onChange={(e) => onChange({ keepLower: e.target.checked })} />
            Keep the lower level for display: also make a nested table of every
            value grouped by {subjectName || "subject"}
          </label>
        </div>
      )}
      <ul className="recipe-counts" aria-label="Experimental units per group">
        {units.slice(0, 24).map((u, i) => (
          <li key={i}>{u.name} <b>n = {u.n}</b>{subjectName ? ` · one per ${subjectName}` : " values"}</li>
        ))}
      </ul>
    </div>
  );
}

function StagingPreview({ staging }: { staging: Staging }) {
  if (!staging.rows.length) return null;
  return (
    <div className="import-preview" tabIndex={0} aria-label="Staged records">
      <table>
        <thead>
          <tr>
            <th className="rn" />
            {staging.columns.map((c, i) => (
              <th key={i} className={`role-${c.role}`} title={c.name}>
                {c.name}<span className={`role-chip role-${c.role}`}>{ROLE_LABELS[c.role].split(" ")[0]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staging.rows.slice(0, 8).map((r, ri) => (
            <tr key={ri}>
              <td className="rn">{ri + 1}</td>
              {r.map((v, i) => (
                <td key={i} className={staging.columns[i].role === "skip" ? "dim" : undefined}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablePreview({ table }: { table: DataTableModel }) {
  const m = tableMatrix(table, { ...DEFAULT_EXPORT, excluded: "asis" });
  if (!m.length) return null;
  const heads = m[0];
  return (
    <div className="import-preview" tabIndex={0} aria-label="The table to be created">
      <table>
        <thead>
          <tr>{heads.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {m.slice(1, 11).map((r, ri) => (
            <tr key={ri}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
