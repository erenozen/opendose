// "Plan an experiment…" (need `design-stage-checks`): the design check
// list a planned experiment gets before any data exist, and the layout of
// the planned table. The rules:
//  - one pooled sample per group (or one unit per group) is n = 1: no
//    variability between independent units, so no test is possible
//    (Lazic 2010; GraphPad Statistics Guide, "The need for independent
//    samples");
//  - a treatment given to a whole cage, tank or dish makes that the
//    experimental unit (ARRIVE 2.0 item 1; Lazic 2010);
//  - technical repeats (wells, reads, cells of one animal) are not n
//    (Aarts et al. 2014; Lazic 2010; Lord et al. 2020);
//  - a vehicle or untreated control, or the reason there is none
//    (ARRIVE 2.0 item 1);
//  - a randomisation plan and blinding (ARRIVE 2.0 items 4 and 5).
// Pure; unit-tested in __tests__/designChecks.test.ts.
import { defaultForm, fFromMeans, type PowerForm } from "../power/power.ts";
import type { DesignAnswers } from "./designToTable.ts";
import type { Design } from "./recommend.ts";
import { SRC, type Source } from "./sources.ts";

export interface PlanAnswers {
  /** Independent units (animals, cultures, experiments) per group. */
  unitsPerGroup: number | null;
  /** The samples of a group are pooled before measuring. */
  pooled: boolean;
  /** The treatment is given to a cage, tank or dish shared by several units. */
  shared: boolean;
  control: "yes" | "no" | "not_needed";
  randomised: "list" | "no";
  blinded: "yes" | "no";
}

export const DEFAULT_PLAN_ANSWERS: PlanAnswers = {
  unitsPerGroup: null, pooled: false, shared: false, control: "yes", randomised: "no",
  blinded: "no",
};

export type CheckState = "bad" | "warn" | "info" | "ok";

export interface DesignCheck {
  id: string;
  state: CheckState;
  title: string;
  detail: string;
  sources: Source[];
  /** A tool that fixes it: the randomisation list or the power tool. */
  action?: "random" | "power";
}

/** The design check list for a planned experiment. */
export function designChecks(d: Design, a: PlanAnswers): DesignCheck[] {
  const out: DesignCheck[] = [];
  const units = a.unitsPerGroup;
  if (a.pooled) {
    out.push({ id: "pooled", state: "bad", title: "One pooled sample per group gives n = 1",
      detail: "Pooling the material of every animal (or culture) in a group before measuring "
        + "leaves one value per group: n = 1, however many animals went into the pool and "
        + "however many times the pool is measured. With n = 1 there is no variation between "
        + "independent units, so no test or confidence interval is possible (OpenDose "
        + "withholds the P value). Measure each animal separately, or make several pools per "
        + "group from different animals: each pool is then one unit.",
      sources: [SRC.lazic2010, SRC.gpIndependent] });
  } else if (units === 1) {
    out.push({ id: "n1", state: "bad", title: "One independent unit per group gives n = 1",
      detail: "With a single animal, culture or experiment per group there is no variation "
        + "between independent units to compare the groups against: any P value would come from "
        + "repeated measurements of the same unit. Plan at least three independent units per "
        + "group, and use the power tool for how many you need.",
      sources: [SRC.gpIndependent, SRC.lazic2010], action: "power" });
  } else if (units !== null && units >= 2 && units <= 3) {
    out.push({ id: "tiny", state: "warn", title: `n = ${units} per group detects only very large effects`,
      detail: `With ${units} independent units per group a test can only reach P < 0.05 for very `
        + "large effects, and a rank test cannot reach it at all with 3 per group. Use the power "
        + "tool to find the n for the smallest difference that matters.",
      sources: [SRC.gpNonparametric], action: "power" });
  }
  if (a.shared) {
    out.push({ id: "shared", state: "warn", title: "The cage, tank or dish is the experimental unit",
      detail: "When the treatment is given to a whole cage, tank or dish, the animals or cells in "
        + "it share it and are not independent: n is the number of cages (tanks, dishes), not "
        + "the number of animals. One cage per group is n = 1. Plan several cages per group, or "
        + "treat animals individually.",
      sources: [SRC.arriveDesign, SRC.lazic2010] });
  }
  if (d.replicates !== "independent") {
    const what = d.replicates === "cells" ? "Cells, wells or fields" : "Technical repeats";
    out.push({ id: "technical", state: "warn", title: "Technical repeats are not n",
      detail: `${what} from one animal or culture measure the same unit again. n is the number of `
        + "animals, cultures or experiments: average the repeats per unit, or analyse them with a "
        + "nested (multilevel) model. Counting them as n gives false positives.",
      sources: [SRC.aarts2014, SRC.lazic2010, SRC.lord2020] });
  }
  if (a.control === "no") {
    out.push({ id: "control", state: "warn", title: "No vehicle or untreated control",
      detail: "Without a control group, the effect of the treatment cannot be separated from the "
        + "vehicle, handling or time. Add a vehicle (or untreated, or sham) group run alongside "
        + "the treated ones; if no control is needed, state why in the methods.",
      sources: [SRC.arriveDesign] });
  } else if (a.control === "not_needed") {
    out.push({ id: "control", state: "info", title: "No separate control: say why",
      detail: "Some designs need no untreated group (two routes of the same drug, animals as "
        + "their own control over time). ARRIVE 2.0 asks for the reason to be stated.",
      sources: [SRC.arriveDesign] });
  }
  if (a.randomised === "no") {
    out.push({ id: "random", state: "warn", title: "No randomisation plan yet",
      detail: "Allocate units to groups at random, from a list made before the experiment, "
        + "not by convenience (the first animals caught, the healthiest-looking dishes). The "
        + "randomisation list tool makes a reproducible list with a seed.",
      sources: [SRC.arriveRandomisation], action: "random" });
  }
  if (a.blinded === "no") {
    out.push({ id: "blind", state: "warn", title: "No blinding plan yet",
      detail: "Whoever allocates, treats, measures and analyses should not know the group where "
        + "this is possible (code the cages or samples). Unblinded outcome assessment inflates "
        + "effects.",
      sources: [SRC.arriveBlinding] });
  }
  if (d.direction === "predicted") {
    out.push({ id: "direction", state: "info", title: "Record the predicted direction now",
      detail: "A one-tailed P is only legitimate when the direction is written down before the "
        + "data are collected. Save the analysis plan to record it; two-tailed P values remain "
        + "the default.",
      sources: [SRC.gpTails, SRC.gpDontPHack] });
  }
  if (!out.some((c) => c.state === "bad" || c.state === "warn")) {
    out.unshift({ id: "ok", state: "ok", title: "No design problem found in these answers",
      detail: "Save the analysis plan before collecting the data so the results can be checked "
        + "against it.", sources: [SRC.arriveProtocol] });
  }
  const rank: Record<CheckState, number> = { bad: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((x, y) => rank[x.state] - rank[y.state]);
}

/** One line per check, for the analysis plan's design notes. */
export function checkLines(cs: DesignCheck[]): string[] {
  return cs.map((c) => `${c.state === "bad" ? "Problem" : c.state === "warn" ? "Check"
    : c.state === "info" ? "Note" : "OK"}: ${c.title}.`);
}

/** The wizard's answers as the three "Describe the experiment" answers
 *  (guide/designToTable.ts), so the table choice is the same. */
export function tableAnswers(d: Design): DesignAnswers {
  const value = d.outcome === "counts" ? "count" : d.outcome === "survival" ? "time-to-event" : "measurement";
  const factors = d.outcome === "curve" ? "x" : d.factors !== "one" || d.differential ? "two" : "one";
  const repeats = d.paired || d.repeated !== "none" || d.blocked ? "repeated"
    : d.replicates !== "independent" ? "nested" : "independent";
  return { value, factors, repeats };
}

/** Default group names for the planned table. */
export function defaultGroupNames(d: Design): { rows: string[]; datasets: string[] } {
  if (d.outcome === "continuous" && (d.differential || d.factors !== "one")) {
    return { rows: ["Vehicle", "Drug"], datasets: ["WT", "KO"] };
  }
  const n = d.groups === "one" ? 1 : d.groups === "two" ? 2 : 3;
  const names = n === 1 ? ["Treated"] : n === 2 ? ["Control", "Treated"] : ["Control", "Drug A", "Drug B"];
  return { rows: [], datasets: names };
}

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export interface PlannedLayout {
  datasets: string[];
  rowTitles: string[];
  init: { datasets: number; subcolumns: number; rows: number };
}

/** The shape and titles of the planned (empty) table. */
export function plannedLayout(tableType: string, d: Design, groups: string, rowLevels: string,
  units: number | null): PlannedLayout {
  const ds = split(groups);
  const rows = split(rowLevels);
  const u = units !== null && units >= 1 ? Math.min(units, 200) : null;
  switch (tableType) {
    case "grouped": {
      const r = rows.length ? rows : ["Vehicle", "Drug"];
      const c = ds.length ? ds : ["WT", "KO"];
      return { datasets: c, rowTitles: r, init: { datasets: c.length, subcolumns: u ?? 3, rows: r.length } };
    }
    case "nested":
      return { datasets: ds, rowTitles: [], init: { datasets: Math.max(ds.length, 1), subcolumns: u ?? 3, rows: 5 } };
    case "contingency":
      return { datasets: ["Yes", "No"], rowTitles: ds, init: { datasets: 2, subcolumns: 1, rows: Math.max(ds.length, 2) } };
    case "survival":
      return { datasets: ds, rowTitles: [], init: { datasets: Math.max(ds.length, 1), subcolumns: 2, rows: u ?? 10 } };
    case "xy":
      return { datasets: ds, rowTitles: [], init: { datasets: Math.max(ds.length, 1), subcolumns: u ?? 3, rows: 9 } };
    default: {
      // Column tables: one column per group (paired: per condition), one
      // row per unit.
      const n = Math.max(ds.length, d.groups === "one" ? 1 : 2);
      return { datasets: ds, rowTitles: [], init: { datasets: n, subcolumns: 1, rows: u ?? 8 } };
    }
  }
}

const sig = (v: number) => String(Number(v.toPrecision(4)));

/** The a priori power form for the planned comparison, or null when the
 *  planner cannot set it up (counts, survival, curves, two factors). */
export function plannedPowerForm(d: Design, delta: number | null, sd: number | null, unit: string): PowerForm | null {
  if (d.outcome !== "continuous" || d.groups === "one" || d.factors !== "one" || d.differential) return null;
  if (delta === null || sd === null || !(delta > 0) || !(sd > 0)) return null;
  const base: PowerForm = { ...defaultForm(), solve: "n", power: "0.8", alpha: "0.05", tails: "2",
    unit: unit || "animals", sd: sig(sd),
    effectSource: `a difference of ${sig(delta)} judged biologically relevant and an expected SD of ${sig(sd)}` };
  if (d.groups === "two") {
    const paired = d.paired || d.blocked;
    return { ...base, kind: paired ? "t_paired" : "t_two_sample", mean1: "0", mean2: sig(delta),
      d: sig(delta / sd), ratio: "1" };
  }
  const k = 3;
  const means = [0, delta, delta / 2];
  const f = fFromMeans(means, sd);
  return f ? { ...base, kind: "anova_oneway", k: String(k), groupMeans: means.map(sig).join(", "),
    groupSd: sig(sd), f: sig(f) } : null;
}
