// The complete fit report (P-21, need N-14 "fit-report-complete"): for one
// data set's curve fit, the model and its equation, the initial value of
// every free parameter and where it came from, the constraints (constants
// and ranges with their stated reasons), the weighting, the CI method,
// every parameter with its SE and CI, and the goodness of fit. Reviewers
// ask for exactly these "full fit details". Numbers are the results
// table's strings (formatSig), never re-rounded. Pure; unit-tested.
import { formatSig, weightingLabel, type FitResult, type OptionsState } from "../../types.ts";
import { constraintKind, constraintState, rangeText } from "./fitOptions.ts";

export interface StartRow { name: string; value: number; source: "rule" | "typed" }

/** The starts the engine reports, in its order. */
export function fitStarts(fit: FitResult): StartRow[] {
  const iv = fit.initial_values ?? {};
  return Object.entries(iv).map(([name, v]) => ({ name, value: v.value, source: v.source }));
}

/** One sentence on how the fit searched beyond the starts listed. */
export function startsNote(fit: FitResult): string {
  const s = fit.starts;
  const typed = fitStarts(fit).some((r) => r.source === "typed");
  const parts: string[] = [];
  if (typed) parts.push("The fit ran from the starts listed, typed ones included, and no others.");
  else if (s && s.n > 1 && s.seeded) {
    parts.push(`The fit also tried ${s.n - 1} more starts with ${s.seeded} set to each X `
      + "value and kept the best.");
  } else parts.push("The fit ran from the starts listed.");
  if (s?.restarted) {
    parts.push("That point was degenerate, so the fit restarted from wider starts and kept the "
      + "better result.");
  }
  return parts.join(" ");
}

const ci = (c: [number, number] | null | undefined) =>
  (c ? [formatSig(c[0]), formatSig(c[1])] : ["", ""]);

/** The constraints of this fit: constants from the fit (every model),
 *  ranges with their reasons from the options (built-in models). */
export function constraintLines(fit: FitResult, options?: OptionsState): string[] {
  const out: string[] = [];
  for (const name of fit.param_order ?? Object.keys(fit.params)) {
    const e = fit.params[name];
    if (e?.constrained && !e.derived) out.push(`${name} = ${formatSig(e.value)} (held constant)`);
  }
  for (const [name, lim] of Object.entries(fit.bounds ?? {})) {
    const st = options ? constraintState(options, name) : null;
    const typed = st && constraintKind(st) !== "constant" ? rangeText(name, st) : null;
    out.push(typed ?? (lim[0] !== null && lim[1] !== null ? `${lim[0]} < ${name} < ${lim[1]}`
      : lim[0] !== null ? `${name} > ${lim[0]}` : `${name} < ${lim[1]}`));
  }
  return out;
}

function ciMethodText(fit: FitResult): string {
  if (fit.fit_method === "robust") return "none (robust regression gives best-fit values only)";
  return fit.ci_method === "profile" ? "profile likelihood (asymmetrical), 95%"
    : "asymptotic (symmetrical), 95%";
}

/** The report as rows: [section, item, value, SE, CI lower, CI upper,
 *  note]. CSV and the text report are both made from these rows. */
export function fitReportRows(name: string, fit: FitResult, options?: OptionsState): string[][] {
  const rows: string[][] = [["Section", "Item", "Value", "Std. Error", "95% CI lower",
    "95% CI upper", "Note"]];
  const row = (sec: string, item: string, value = "", rest: string[] = []) =>
    rows.push([sec, item, value, ...rest, ...Array(4 - rest.length).fill("")].slice(0, 7));
  row("Fit", "Data set", name);
  row("Fit", "Model", fit.label ?? fit.model);
  row("Fit", "Equation", fit.equation);
  for (const s of fitStarts(fit)) {
    row("Initial values", s.name, formatSig(s.value),
      ["", "", "", s.source === "typed" ? "typed" : "from the model's rules"]);
  }
  if (fit.initial_values) row("Initial values", "Search", "", ["", "", "", startsNote(fit)]);
  const cons = constraintLines(fit, options);
  if (!cons.length) row("Constraints", "None");
  for (const c of cons) row("Constraints", c);
  row("Method", "Weighting", fit.weighting && fit.weighting !== "none"
    ? weightingLabel(fit.weighting) : "No weighting");
  row("Method", "Confidence intervals", ciMethodText(fit));
  for (const p of fit.param_order ?? Object.keys(fit.params)) {
    const e = fit.params[p];
    if (!e) continue;
    const note = e.at_bound ? "at its constraint: SE not reliable"
      : e.constrained ? "held constant" : e.derived ? "derived" : "";
    const [lo, hi] = e.constrained || e.at_bound ? ["", ""] : ci(e.ci95);
    row("Parameters", p, formatSig(e.value),
      [e.se === null || e.constrained ? "" : formatSig(e.se), lo, hi, note]);
  }
  const g = fit.goodness;
  row("Goodness of fit", "Degrees of freedom", String(g.df));
  if (g.r_squared !== null && g.r_squared !== undefined) {
    row("Goodness of fit", "R squared", formatSig(g.r_squared));
  }
  row("Goodness of fit", "Sum of squares", formatSig(g.ss_res));
  if (g.sy_x !== null && g.sy_x !== undefined) row("Goodness of fit", "Sy.x", formatSig(g.sy_x));
  row("Goodness of fit", "Number of points", String(g.n_points));
  return rows;
}

/** The plain-text report ("Copy fit report"). */
export function fitReportText(name: string, fit: FitResult, options?: OptionsState): string {
  const rows = fitReportRows(name, fit, options).slice(1);
  const lines: string[] = [`Fit report: ${name}`];
  let section = "";
  for (const [sec, item, value, se, lo, hi, note] of rows) {
    if (sec === "Fit" && item === "Data set") continue;
    if (sec !== section) {
      lines.push("", `${sec}`);
      section = sec;
    }
    if (sec === "Parameters") {
      const bits = [`${item} = ${value}`];
      if (se) bits.push(`SE ${se}`);
      if (lo) bits.push(`95% CI ${lo} to ${hi}`);
      if (note) bits.push(note);
      lines.push(`  ${bits.join(", ")}`);
    } else if (sec === "Initial values" && item !== "Search") {
      lines.push(`  ${item} = ${value} (${note})`);
    } else {
      lines.push(`  ${[item, value, note].filter(Boolean).join(": ")}`);
    }
  }
  return lines.join("\n") + "\n";
}
