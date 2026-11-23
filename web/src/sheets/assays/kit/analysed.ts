// The "Analysed" line of an assay's results (P-16): n used, what was left
// out and why, named by table row or well, one reader per assay kind,
// because each reads its table its own way (sample names, gene names and
// well ids are text by design). Called by project/dataNotes.ts for the
// Notes strip under the results. Each reader re-reads the table the way
// the module's run does and lines it up with the engine result the run
// returned; it never recomputes a number the engine reports. Pure;
// checked against the engine's output on the e2e examples
// (__tests__/analysed.test.ts).
import { numericData, parseCell } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { normalizeDensOptions, readLanes } from "../densitometry/model.ts";
import { ANALYSIS_ASSAY_FLOW, normalizeFlowOptions, readFlow, unitSingular } from "../flow/model.ts";
import { ANALYSIS_KINETIC, blankIndexOf, normalizeKinetic } from "../kinetic/model.ts";
import { blankOf, normalizeLucOptions, readWells } from "../luciferase/model.ts";
import { ANALYSIS_MIC } from "../mic/model.ts";
import { dims, normalizePlateOptions, parseWell, platesOf, wellName } from "../plate/model.ts";
import { normalizeQpcrOptions, readQpcr } from "../qpcr/model.ts";
import { normalizeStdOptions, readRows, signalColumns, STD_ROLES, type StdRun } from "../stdcurve/model.ts";
import { ANALYSIS_WOUND } from "../wound/model.ts";
import { numberColumn, resolveColumns, textColumn } from "./columns.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AnalysedNote { text: string; tone: "info" | "warn" }
export interface AssayAnalysed {
  /** "16 of 16 lanes on 4 blots in the ratios; n = 4 blots" (the Notes
   *  strip adds "Analysed:" and the full stop). */
  analysed: string | null;
  notes: AnalysedNote[];
}

// ------------------------------------------------------------ wording

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const was = (n: number) => (n === 1 ? "was" : "were");

/** "a, b and c"; past `max` items "a, b, c and 4 more". */
export function listOf(items: string[], max = 8): string {
  if (items.length > max) return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "row 3", "rows 3, 9 and 17" (0-based rows in, numbered as the grid). */
export function rowsText(rows: number[]): string {
  const s = [...new Set(rows)].sort((a, b) => a - b).map((r) => String(r + 1));
  return `row${s.length === 1 ? "" : "s"} ${listOf(s, 12)}`;
}

/** Why a cell gives no number: excluded, blank, or the text it holds. */
export function cellWhy(t: DataTableModel, ds: number, row: number, sub = 0): string {
  const d = t.datasets[ds];
  if (d?.excluded?.includes(`${row}:${sub}`)) return "excluded";
  const raw = (d?.rows[row]?.[sub] ?? "").trim();
  return raw === "" ? "blank" : `“${raw}”`;
}

/** Rows holding anything in any column. */
function filledRows(t: DataTableModel): number[] {
  const out: number[] = [];
  for (let r = 0; r < t.x.length; r++) {
    if (t.datasets.some((d) => (d.rows[r]?.[0] ?? "").trim() !== "")) out.push(r);
  }
  return out;
}

/** "; 2 left out: A7 (“Undetermined”) and A8 (blank)" style clauses. */
function leftOut(one: string, many: string, items: string[]): string {
  return items.length ? `; ${plural(items.length, one, many)} left out: ${listOf(items)}` : "";
}

// ------------------------------------------------------------ standard curve

function stdcurve(t: DataTableModel, options: unknown, result: unknown): AssayAnalysed | null {
  const run = result as StdRun | null;
  if (!run?.plates?.length) return null;
  const o = normalizeStdOptions(options);
  const { rows } = readRows(t, o);
  const notes: AnalysedNote[] = [];
  const read = new Set(rows.map((r) => r.row));
  const unit = o.unit.trim() || "units";
  // rows the curve never sees, and signals that are not numbers
  const noSignal: number[] = [];
  const typed: number[] = [];
  const badCells: string[] = [];
  if (t.type === "xy") {
    const dIdx = t.datasets.findIndex((d) => /dilut/i.test(d.name));
    const sIdx = t.datasets.findIndex((_, i) => i !== dIdx);
    for (let r = 0; r < t.x.length; r++) {
      const subs = t.datasets[sIdx]?.rows[r] ?? [];
      if (!read.has(r) && ((t.x[r] ?? "").trim() !== "" || (t.rowTitles?.[r] ?? "").trim() !== "")) noSignal.push(r);
      subs.forEach((v, s) => {
        const why = cellWhy(t, sIdx, r, s);
        if (why === "excluded" || (parseCell(v) === null && why !== "blank")) badCells.push(`row ${r + 1} Y${s + 1} (${why})`);
      });
    }
  } else {
    const idx = resolveColumns(t, STD_ROLES, o.columns);
    const sig = signalColumns(t, o, Object.values(idx));
    const type = textColumn(t, idx.type);
    for (const r of filledRows(t)) {
      if (!read.has(r)) (/^(skip|exclude|empty|ignore)/i.test(type[r]) ? typed : noSignal).push(r);
    }
    for (const r of rows) {
      for (const c of sig) {
        const why = cellWhy(t, c, r.row);
        if (why === "excluded" || (parseCell(t.datasets[c].rows[r.row]?.[0] ?? "") === null && why !== "blank")) {
          badCells.push(`row ${r.row + 1} ${t.datasets[c].name} (${why})`);
        }
      }
    }
  }
  if (noSignal.length) {
    notes.push({ tone: "warn", text: `${plural(noSignal.length, "row has", "rows have")} no signal and `
      + `${was(noSignal.length)} left out: ${rowsText(noSignal)}.` });
  }
  if (typed.length) {
    notes.push({ tone: "info", text: `${plural(typed.length, "row", "rows")} typed “skip” (or exclude, empty, `
      + `ignore) ${was(typed.length)} left out: ${rowsText(typed)}.` });
  }
  if (badCells.length) {
    notes.push({ tone: "warn", text: `${plural(badCells.length, "signal", "signals")} left out: ${listOf(badCells)}.` });
  }
  // with a Plate column, one curve per plate (stdPayloads): a row without
  // a plate is in none of them
  const byPlate = run.plates.some((p) => p.plate !== "");
  const noPlate = byPlate ? rows.filter((r) => r.plate === "").map((r) => r.row) : [];
  if (noPlate.length) {
    notes.push({ tone: "warn", text: `${plural(noPlate.length, "row has", "rows have")} no plate and `
      + `${was(noPlate.length)} left out: ${rowsText(noPlate)}.` });
  }
  const many = run.plates.length > 1;
  const parts = run.plates.map(({ plate, res }) => {
    const head = many ? `Plate ${plate}: ` : "";
    if (!res || res.error) return `${head}no curve (${String(res?.error ?? "no result").replace(/\.$/, "")})`;
    const mine = rows.filter((r) => !byPlate || r.plate === plate);
    const levels = (res.standards ?? []) as any[];
    const fitted = levels.filter((l) => l.concentration > 0 && !l.excluded);
    const reps = fitted.reduce((s, l) => s + (l.n ?? 0), 0);
    const blank = res.blank !== null && res.blank !== undefined
      ? levels.find((l) => l.concentration === 0) : null;
    for (const l of levels.filter((x) => x.concentration > 0 && x.excluded)) {
      const at = mine.filter((r) => r.kind === "standard" && r.conc === l.concentration).map((r) => r.row);
      notes.push({ tone: "info", text: `${head}${head ? "the" : "The"} ${l.concentration} ${unit} standard was left out of the fit: `
        + `${String(l.excluded).replace(/\.$/, "")}${at.length ? ` (${rowsText(at)})` : ""}.` });
    }
    // unknowns come back in the order they were sent (stdPayloads)
    const sent = mine.filter((r) => r.kind === "unknown");
    const unk = (res.unknowns ?? []) as any[];
    const label = (u: any, i: number) => `${u.name}${u.dilution && u.dilution !== 1 ? ` 1:${u.dilution}` : ""}`
      + (sent.length === unk.length ? `, row ${sent[i].row + 1}` : "");
    const ok = unk.filter((u) => u.status === "ok").length;
    const off = [["<LLOQ", "below the LLOQ"], [">ULOQ", "above the ULOQ"], ["no_data", "without a signal"]]
      .map(([s, words]) => {
        const at = unk.map((u, i) => (u.status === s ? label(u, i) : "")).filter(Boolean);
        return at.length ? `${at.length} ${words} (${listOf(at)})` : "";
      }).filter(Boolean);
    const lows = mine.filter((r) => r.kind === "low").length;
    return `${head}standards: ${plural(reps, "replicate", "replicates")} at ${plural(fitted.length, "level",
      "levels")} in the fit${blank ? `, blank subtracted (${plural(blank.n ?? 0, "replicate", "replicates")})` : ""}`
      + (unk.length ? `; unknowns: ${ok} of ${plural(unk.length, "dilution", "dilutions")} reportable`
        + (off.length ? `, ${off.join(", ")}` : "") : "; no unknowns")
      + (lows ? `; ${plural(lows, "low-level row", "low-level rows")} for the detection limits` : "");
  });
  return { analysed: parts.join("; "), notes };
}

// ------------------------------------------------------------ qPCR

function qpcr(t: DataTableModel, options: unknown, result: unknown): AssayAnalysed | null {
  const r = result as any;
  if (!r || r.error || !Array.isArray(r.replicates)) return null;
  const o = normalizeQpcrOptions(options);
  const d = readQpcr(t, o);
  const notes: AnalysedNote[] = [];
  // the table rows of each sample × target's wells, in the order sent
  const rowsOf = new Map<string, number[]>();
  d.records.forEach((rec, i) => {
    const k = `${rec.sample}\u0000${rec.target}`;
    rowsOf.set(k, [...(rowsOf.get(k) ?? []), d.rows[i]]);
  });
  const noCq: string[] = [];
  const high: string[] = [];
  const substituted: string[] = [];
  let used = 0;
  let total = 0;
  // genes neither normalised to nor quantified: set aside by the
  // reference check (options.referenceCandidates)
  const inUse = new Set<string>([...(r.reference_genes ?? []), ...(r.targets ?? [])].map(String));
  const aside = new Map<string, number>();
  for (const rep of r.replicates as any[]) {
    if (!inUse.has(String(rep.target))) {
      aside.set(rep.target, (aside.get(rep.target) ?? 0) + (rep.n_replicates ?? 0));
      continue;
    }
    used += rep.n_used ?? 0;
    total += rep.n_replicates ?? 0;
    const at = rowsOf.get(`${rep.sample}\u0000${rep.target}`) ?? [];
    const cqs = (rep.cq_values ?? []) as (number | null)[];
    cqs.forEach((cq, i) => {
      const row = cqs.length === at.length ? at[i] : undefined;
      const id = `${rep.sample} ${rep.target} ${rep.wells?.[i] || (row !== undefined ? `row ${row + 1}` : `well ${i + 1}`)}`;
      if (cq === null) {
        const why = row !== undefined && d.idx.cq >= 0 ? cellWhy(t, d.idx.cq, row) : "no Cq";
        (rep.flags?.includes("undetermined_substituted") ? substituted : noCq).push(`${id} (${why})`);
      } else if (r.qc?.exclude_high_cq && typeof r.qc.max_cq === "number" && cq > r.qc.max_cq) high.push(`${id} (Cq ${cq})`);
    });
  }
  // biological samples per group, per target (the statistics' n)
  const per = ((r.per_target ?? []) as any[]).map((p) => ({ target: String(p.target),
    groups: ((p.groups ?? []) as any[]).map((g) => `${g.group} ${g.n}`).join(", ") }));
  const same = per.length > 0 && per.every((p) => p.groups === per[0].groups);
  const n = !per.length ? "" : same ? `; samples per group: ${per[0].groups}`
    : `; samples per group: ${per.map((p) => `${p.target}: ${p.groups}`).join("; ")}`;
  const analysed = `${used} of ${plural(total, "sample well", "sample wells")} used`
    + leftOut("well without a Cq", "wells without a Cq", noCq)
    + (high.length ? `; ${plural(high.length, "well", "wells")} above Cq ${r.qc.max_cq} left out: ${listOf(high)}` : "")
    + (substituted.length ? `; ${plural(substituted.length, "well", "wells")} without a Cq read as Cq `
      + `${r.qc?.undetermined_value}: ${listOf(substituted)}` : "")
    + (aside.size ? `; ${listOf([...aside].map(([g, k]) => `${g} (${plural(k, "well", "wells")})`))} set aside `
      + "by the reference check, not used" : "")
    + n
    + (d.controls ? `; ${plural(d.controls, "NTC or no-RT control well", "NTC or no-RT control wells")} checked, not quantified` : "");
  // rows the reader skips before the engine
  if (d.idx.target >= 0) {
    const target = textColumn(t, d.idx.target);
    const noTarget = filledRows(t).filter((row) => !target[row]);
    if (noTarget.length) {
      notes.push({ tone: "warn", text: `${plural(noTarget.length, "row has", "rows have")} no target and `
        + `${was(noTarget.length)} left out: ${rowsText(noTarget)}.` });
    }
    const qty = numberColumn(t, d.idx.quantity);
    const series = filledRows(t).filter((row) => target[row] && qty[row] !== null && qty[row]! > 0);
    if (series.length) {
      const how = r.lod95 ? "used for the LoD95"
        : o.efficiencyMode === "curve" ? "used for the amplification efficiencies"
          : "not used: choose efficiencies from a standard curve to use them";
      notes.push({ tone: "info", text: `${plural(series.length, "row", "rows")} with a quantity (a dilution `
        + `series) ${was(series.length)} not quantified, ${how}: ${rowsText(series)}.` });
    }
  }
  return { analysed, notes };
}

// ------------------------------------------------------------ flow

function flow(t: DataTableModel, options: unknown, result: unknown): AssayAnalysed | null {
  const r = result as any;
  if (!r || r.error || !Array.isArray(r.experiments)) return null;
  const o = normalizeFlowOptions(options);
  const d = readFlow(t, o);
  if (!d.stat) return null;
  const named = new Set(d.samples.map((s) => s.row));
  const filled = filledRows(t);
  const noName = filled.filter((row) => !named.has(row));
  const noParts = d.samples.filter((s) => !s.experiment || !s.condition);
  const num = (v: string) => Number.isFinite(Number(v.trim().replace(/%$/, "").replace(",", ".")))
    && v.trim() !== "";
  const noValue = d.samples.filter((s) => s.experiment && s.condition && !num(s.value));
  const used = d.samples.length - noParts.length - noValue.length;
  const unit = o.unit.trim() || "donors";
  const one = unitSingular(unit).toLowerCase();
  const tech = ((r.n_technical ?? []) as number[][]).flat().filter((k) => k > 1).length;
  const analysed = `${used} of ${plural(filled.length, "row", "rows")}: ${plural(r.experiments.length, one, unit)} × `
    + `${plural((r.conditions ?? []).length, "condition", "conditions")}, one value per ${one} and condition`
    + (tech ? ` (technical tubes averaged in ${plural(tech, "cell", "cells")})` : "")
    + leftOut("row without a sample name", "rows without a sample name", noName.map((row) => `row ${row + 1}`))
    + leftOut("name without a donor or condition part", "names without a donor or condition part",
      noParts.map((s) => `row ${s.row + 1}, “${s.sample}”`))
    + leftOut("value that is not a number", "values that are not numbers",
      noValue.map((s) => `row ${s.row + 1}, ${cellWhy(t, d.stat!.index, s.row)}`));
  return { analysed, notes: [] };
}

// ------------------------------------------------------------ densitometry

const LANE_WHY: Record<string, string> = {
  target_not_above_background: "target not above background",
  reference_not_above_background: "loading control not above background",
};

function densitometry(t: DataTableModel, options: unknown, result: unknown): AssayAnalysed | null {
  const r = result as any;
  if (!r || r.error || !Array.isArray(r.lanes)) return null;
  const o = normalizeDensOptions(options);
  const d = readLanes(t, o);
  const notes: AnalysedNote[] = [];
  const kept = new Set(d.rows);
  const blot = textColumn(t, d.idx.blot);
  const group = textColumn(t, d.idx.group);
  const skipped = filledRows(t).filter((row) => !kept.has(row)).map((row) => `row ${row + 1} (${
    !blot[row] ? "no blot" : !group[row] ? "no group" : `target ${cellWhy(t, d.idx.target, row)}`})`);
  const lanes = r.lanes as any[];
  const aligned = lanes.length === d.rows.length;
  const name = (l: any, i: number) => `${l.blot} lane ${l.lane}${aligned ? `, row ${d.rows[i] + 1}` : ""}`;
  const out = lanes.map((l, i) => (l.normalized === null
    ? `${name(l, i)} (${(l.flags ?? []).map((f: string) => LANE_WHY[f]).filter(Boolean).join(", ") || "no ratio"})`
    : "")).filter(Boolean);
  const used = lanes.length - out.length;
  // a lane with no loading-control value is normalised by its target alone
  // (assay_densitometry), not as a ratio: name it next to the n
  if (d.idx.reference >= 0) {
    const alone = lanes.map((l, i) => (l.normalized !== null && l.flags?.includes("no_reference") ? name(l, i) : ""))
      .filter(Boolean);
    if (alone.length) {
      notes.push({ tone: "warn", text: `${plural(alone.length, "lane has", "lanes have")} no loading-control `
        + `value, so ${alone.length === 1 ? "its" : "their"} target signal alone stands in for the ratio: `
        + `${listOf(alone)}. Enter the loading control, or exclude ${alone.length === 1 ? "the lane" : "those lanes"}.` });
    }
  }
  const blots = (r.blots ?? []) as string[];
  const analysed = `${used} of ${plural(lanes.length, "lane", "lanes")} on ${plural(blots.length, "blot", "blots")} `
    + `in the ratios; n = ${plural(r.n_blots_used ?? 0, "blot", "blots")}`
    + leftOut("lane", "lanes", out) + leftOut("row", "rows", skipped);
  return { analysed, notes };
}

// ------------------------------------------------------------ plate reader

function plate(t: DataTableModel, options: unknown, result: unknown): AssayAnalysed | null {
  const run = result as { plates?: any[] } | null;
  if (!run?.plates?.length) return null;
  const o = normalizePlateOptions(options);
  const [nr] = dims(o.format);
  const grids = platesOf(t, o.format);
  const many = run.plates.length > 1;
  const parts = run.plates.map((res, k) => {
    const head = many ? `Plate ${k + 1}: ` : "";
    if (!res || res.error) return `${head}not analysed (${String(res?.error ?? "no result").replace(/\.$/, "")})`;
    const wells = (res.wells ?? []) as any[];
    const where = (w: string) => {
      const rc = parseWell(w);
      return rc ? cellWhy(t, rc[1], k * nr + rc[0]) : "no reading";
    };
    const missing = wells.filter((w) => w.raw === null).map((w) => `${w.well} (${where(w.well)})`);
    const read = wells.filter((w) => w.raw !== null);
    const samples = read.filter((w) => w.role === "sample").length;
    const unnormalised = read.filter((w) => w.role === "sample" && w.normalized === null).map((w) => w.well);
    const mapped = new Set(wells.map((w) => w.well));
    const unmapped: string[] = [];
    (grids[k] ?? []).forEach((row, ri) => row.forEach((v, ci) => {
      if (v !== null && !mapped.has(wellName(ri, ci))) unmapped.push(wellName(ri, ci));
    }));
    return `${head}${read.length} of ${plural(wells.length, "mapped well", "mapped wells")} read (${samples} sample, `
      + `${read.length - samples} control)`
      + leftOut("well", "wells", missing)
      + (unnormalised.length ? `; ${plural(unnormalised.length, "sample well", "sample wells")} not normalised `
        + `(no control mean to scale by): ${listOf(unnormalised)}` : "")
      + (unmapped.length ? `; ${plural(unmapped.length, "well with a reading is", "wells with readings are")} `
        + `not in the plate map and not used: ${listOf(unmapped)}` : "");
  });
  return { analysed: parts.join("; "), notes: [] };
}

// ------------------------------------------------------------ XY replicate tables (kinetic, wound, MIC)

interface Trace { ds: number; k: number; reads: number; bad: string[] }

/** Each data set × replicate column holding anything: its usable reads
 *  (a number at a usable X) and the cells left out (text, excluded, or a
 *  value at a row without X). */
function traces(t: DataTableModel): Trace[] {
  const nd = numericData(t);
  const out: Trace[] = [];
  t.datasets.forEach((d, ds) => {
    const subs = Math.max(0, ...d.rows.map((r) => r.length));
    for (let k = 0; k < subs; k++) {
      const any = d.rows.some((r) => (r[k] ?? "").trim() !== "");
      if (!any) continue;
      let reads = 0;
      const bad: string[] = [];
      d.rows.forEach((_, r) => {
        const v = nd.datasets[ds].ys[r]?.[k] ?? null;
        const why = cellWhy(t, ds, r, k);
        if (v === null) { if (why !== "blank") bad.push(`row ${r + 1} (${why})`); return; }
        if (nd.x[r] === null) { bad.push(`row ${r + 1} (no X)`); return; }
        reads++;
      });
      out.push({ ds, k, reads, bad });
    }
  });
  return out;
}

/** "“25” well 2": the data set's name quoted (kinetic samples are often
 *  named by a number). */
const traceName = (t: DataTableModel, x: Trace, word: string) => `“${t.datasets[x.ds].name}” ${word} ${x.k + 1}`;

const FLAG_WHY: Record<string, string> = {
  too_few_points_in_window: "too few reads in the window",
  fewer_reads_than_window: "fewer reads than the window",
  no_fit: "no fit",
  initial_not_positive: "no positive first value",
  no_value_at_first_time: "no value at the first time",
};

function readsNote(t: DataTableModel, tr: Trace[], word: string): AnalysedNote[] {
  const bad = tr.flatMap((x) => x.bad.map((b) => `${traceName(t, x, word)} ${b}`));
  return bad.length ? [{ tone: "warn", text: `${plural(bad.length, "value", "values")} left out: ${listOf(bad)}.` }] : [];
}

function kinetic(t: DataTableModel, options: unknown, result: unknown): AssayAnalysed | null {
  const r = result as any;
  if (!r || r.error || !Array.isArray(r.wells)) return null;
  const tr = traces(t);
  const wells = r.wells as any[];
  const at = (x: Trace) => wells.find((w) => w.dataset === x.ds && w.well === x.k + 1);
  const name = (x: Trace) => traceName(t, x, "well");
  const out = tr.map((x) => {
    const w = at(x);
    if (!w) return `${name(x)} (${plural(x.reads, "read", "reads")}, fewer than 2)`;
    if (w.rate === null || w.rate === undefined) {
      return `${name(x)} (${(w.flags ?? []).map((f: string) => FLAG_WHY[f]).filter(Boolean).join(", ") || "no rate"})`;
    }
    return "";
  }).filter(Boolean);
  const withRate = tr.length - out.length;
  const blank = blankIndexOf(t, normalizeKinetic(options));
  const notes = readsNote(t, tr, "well");
  // the Michaelis-Menten table takes the samples named by a concentration
  const named = ((r.samples ?? []) as any[]).filter((s) => !s.is_blank);
  const unnamed = named.filter((s) => s.substrate === null).map((s) => s.sample);
  if (unnamed.length && named.length - unnamed.length >= 3) {
    notes.push({ tone: "info", text: `${plural(unnamed.length, "sample is", "samples are")} not named by a `
      + `substrate concentration, so ${unnamed.length === 1 ? "it stays" : "they stay"} out of the rates table: `
      + `${listOf(unnamed.map((s: string) => `“${s}”`))}.` });
  }
  const samples = new Set(tr.map((x) => x.ds)).size;
  const analysed = `${withRate} of ${plural(tr.length, "well", "wells")} with a rate (${plural(samples, "sample",
    "samples")}${blank >= 0 ? `, “${t.datasets[blank].name}” as the blank` : ""})` + leftOut("well", "wells", out);
  return { analysed, notes };
}

function wound(t: DataTableModel, _options: unknown, result: unknown): AssayAnalysed | null {
  const r = result as any;
  if (!r || r.error || !Array.isArray(r.wells)) return null;
  const tr = traces(t);
  const wells = r.wells as any[];
  const at = (x: Trace) => wells.find((w) => w.condition === t.datasets[x.ds].name && w.well === x.k + 1);
  const name = (x: Trace) => traceName(t, x, "well");
  const out = tr.map((x) => {
    const w = at(x);
    if (!w) return `${name(x)} (${plural(x.reads, "value", "values")}, fewer than 2)`;
    if (w.rate === null || w.rate === undefined) {
      return `${name(x)} (${(w.flags ?? []).map((f: string) => FLAG_WHY[f]).filter(Boolean).join(", ") || "no rate"})`;
    }
    return "";
  }).filter(Boolean);
  const conditions = new Set(tr.map((x) => x.ds)).size;
  const analysed = `${tr.length - out.length} of ${plural(tr.length, "well", "wells")} with a closure rate `
    + `(${plural(conditions, "condition", "conditions")})` + leftOut("well", "wells", out);
  return { analysed, notes: readsNote(t, tr, "well") };
}

const SERIES_WHY: Record<string, string> = {
  no_growth_control: "no growth control",
  growth_control_did_not_grow: "the growth control did not grow",
  multiple_skipped_wells: "more than one skipped well",
};

function mic(t: DataTableModel, _options: unknown, result: unknown): AssayAnalysed | null {
  const r = result as any;
  if (!r || r.error || !Array.isArray(r.series)) return null;
  const tr = traces(t);
  const series = r.series as any[];
  const name = (x: Trace) => traceName(t, x, "series");
  const out = tr.map((x) => {
    const s = series.find((v) => v.strain === t.datasets[x.ds].name && v.series === x.k + 1);
    if (!s) return `${name(x)} (no readings)`;
    if (!s.valid) {
      return `${name(x)} (${(s.flags ?? []).map((f: string) => SERIES_WHY[f]).filter(Boolean).join(", ")
        || "no MIC read"})`;
    }
    return "";
  }).filter(Boolean);
  const strains = new Set(tr.map((x) => x.ds)).size;
  const analysed = `${tr.length - out.length} of ${plural(tr.length, "dilution series", "dilution series")} valid `
    + `(${plural(strains, "strain", "strains")})` + leftOut("series", "series", out);
  return { analysed, notes: readsNote(t, tr, "series") };
}

// ------------------------------------------------------------ luciferase

const WELL_WHY: Record<string, string> = {
  missing_reading: "a reading missing",
  firefly_not_above_background: "Firefly not above background",
  renilla_not_above_background: "Renilla not above background",
};

function luciferase(t: DataTableModel, options: unknown, result: unknown): AssayAnalysed | null {
  const r = result as any;
  if (!r || r.error || !Array.isArray(r.wells)) return null;
  const o = normalizeLucOptions(options);
  const d = readWells(t, o);
  const blank = blankOf(o, d.groups);
  const kept = new Set(d.rows);
  const group = textColumn(t, d.idx.group);
  const skipped = filledRows(t).filter((row) => !kept.has(row))
    .map((row) => `row ${row + 1} (${!group[row] ? "no group" : "no readings"})`);
  // the engine's wells are the records outside the blank group, in order
  const sent = d.records.map((rec, i) => ({ rec, row: d.rows[i] })).filter((x) => x.rec.group !== blank);
  const wells = r.wells as any[];
  const aligned = sent.length === wells.length;
  const out = wells.map((w, i) => (w.ratio === null
    ? `${w.well}${aligned && w.well !== String(sent[i].row + 1) ? `, row ${sent[i].row + 1}` : ""} (${
      (w.flags ?? []).map((f: string) => WELL_WHY[f]).filter(Boolean).join(", ") || "no ratio"})`
    : "")).filter(Boolean);
  const blanks = d.records.length - sent.length;
  const analysed = `${wells.length - out.length} of ${plural(wells.length, "well", "wells")} with a ratio`
    + (blanks ? ` (${plural(blanks, "well", "wells")} of “${blank}” as the background)` : "")
    + (r.unit === "experiment" ? `; n = ${plural(r.n_units ?? 0, "experiment", "experiments")}` : "")
    + leftOut("well", "wells", out) + leftOut("row", "rows", skipped);
  return { analysed, notes: [] };
}

// ------------------------------------------------------------ dispatch

const READERS: Record<string, (t: DataTableModel, options: unknown, result: unknown) => AssayAnalysed | null> = {
  assay_stdcurve: stdcurve,
  assay_qpcr: qpcr,
  [ANALYSIS_ASSAY_FLOW]: flow,
  assay_densitometry: densitometry,
  assay_plate: plate,
  [ANALYSIS_KINETIC]: kinetic,
  assay_luciferase: luciferase,
  [ANALYSIS_WOUND]: wound,
  [ANALYSIS_MIC]: mic,
};

/** The assay kinds with a reader. */
export const ANALYSED_ASSAYS = Object.keys(READERS);

/** The Analysed line and notes of an assay result, or null (no reader for
 *  this assay, no result, or the run failed). */
export function assayAnalysed(analysisId: string, t: DataTableModel, options: unknown,
  result: unknown): AssayAnalysed | null {
  const read = READERS[analysisId];
  if (!read || !result || typeof result !== "object" || (result as { error?: unknown }).error) return null;
  return read(t, options, result);
}
