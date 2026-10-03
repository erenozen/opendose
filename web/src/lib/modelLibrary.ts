// The curve-fitting model library. The engine's equation registry is the
// source of truth: at engine boot `applyModelList` fills MODELS_META from
// the `list_models` handler (families, equations, parameters, derived
// values, constants, sharing). Until then a small static fallback covers
// the boot sequence and every model id that projects saved before the
// library existed can reference. Pure (no React, no engine import) so it
// is unit-tested with node --test.

export interface ModelMeta {
  /** Id stored in results options (equals the engine id, except for the
   *  few library entries whose id an older special path already uses). */
  id: string;
  /** Model id the engine fits. */
  engineId: string;
  label: string;
  family: string;
  xLabel: string;     // axis title stem
  yLabel?: string;
  needsLogX: boolean; // engine expects X as log10(concentration)
  /** Parameters the user may hold constant / share. */
  constrainable: string[];
  /** Experimental constants the user must supply (one value per fit). */
  constants?: string[];
  equation?: string;
  parameters?: string[];
  /** Derived values the fit reports (IC50, Span, HalfLife, ...). */
  derived?: string[];
  /** Constants with one value per data set (read from the data set's
   *  title unless entered). */
  datasetConstants?: string[];
  /** Parameters shared across data sets by default (global models). */
  shared?: string[];
  /** Parameters that only exist for some data sets ("first" / "rest"). */
  paramScope?: Record<string, string>;
  /** Fitted to all data sets at once only. */
  globalOnly?: boolean;
  fixedByDefault?: Record<string, number>;
  /** Fitted by the original single-table code paths (global_fit for
   *  sharing): their output must not change. */
  legacy?: boolean;
  /** UI-only special path (antagonist concentrations typed in). */
  special?: "gaddum_schild_classic";
}

/** list_models entry, as the engine sends it. */
export interface EngineModelEntry {
  id: string;
  label: string;
  family: string;
  equation: string;
  parameters: string[];
  has_log_x: boolean;
  x_label: string;
  y_label?: string;
  derived?: string[];
  required_constants?: string[];
  dataset_constants?: string[];
  shared?: string[];
  param_scope?: Record<string, string>;
  global_only?: boolean;
  fixed_by_default?: Record<string, number>;
  constrainable?: string[];
}

/** Id of the "user-defined equation" choice in results options. */
export const USER_MODEL_ID = "user";

/** The Gaddum/Schild fit with antagonist concentrations typed in, which
 *  predates the library. The library's own model of the same engine id
 *  is listed under LIBRARY_ALIAS instead. */
export const CLASSIC_SHIFT_ID = "ec50_shift";
const LIBRARY_ALIAS: Record<string, string> = { ec50_shift: "ec50_shift_conc" };

/** The sixteen models of the original app, fitted by the original code
 *  paths (and the reference 4PL that every check pins). */
export const LEGACY_MODEL_IDS = new Set([
  "log_inhibitor_vs_response_4pl", "log_inhibitor_vs_response_3pl",
  "log_agonist_vs_response_4pl", "log_agonist_vs_response_3pl",
  "michaelis_menten", "one_site_competition", "one_site_fit_ki",
  "two_site_competition", "saturation_binding", "one_phase_decay",
  "one_phase_association", "exponential_growth", "two_phase_decay",
  "polynomial_second", "polynomial_third", "straight_line",
]);

const F_INH = "Dose-response - Inhibition";
const F_STIM = "Dose-response - Stimulation";
const F_ENZ = "Enzyme kinetics - Velocity as a function of substrate";
const F_COMP = "Receptor binding - Competitive binding";
const F_SAT = "Receptor binding - Saturation binding";
const F_SPECIAL_LOG = "Dose-response - Special, X is log(concentration)";

function legacy(id: string, label: string, family: string, xLabel: string,
  needsLogX: boolean, parameters: string[], extra: Partial<ModelMeta> = {}): ModelMeta {
  return {
    id, engineId: id, label, family, xLabel, needsLogX, parameters,
    constrainable: parameters.filter((p) => !(extra.constants ?? []).includes(p)
      && !(p in (extra.fixedByDefault ?? {}))),
    legacy: true, ...extra,
  };
}

const LOG4 = "Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))";
const LOG4A = "Y=Bottom + (Top-Bottom)/(1+10^((LogEC50-X)*HillSlope))";

/** Static fallback: the original models, in the engine's own words. */
export function fallbackModels(): ModelMeta[] {
  return [
    legacy("log_inhibitor_vs_response_4pl",
      "log(inhibitor) vs. response -- Variable slope (four parameters)", F_INH,
      "log[Inhibitor]", true, ["Top", "Bottom", "LogIC50", "HillSlope"],
      { equation: LOG4, derived: ["IC50", "Span"] }),
    legacy("log_inhibitor_vs_response_3pl",
      "log(inhibitor) vs. response -- (three parameters)", F_INH,
      "log[Inhibitor]", true, ["Top", "Bottom", "LogIC50", "HillSlope"],
      { equation: LOG4, derived: ["IC50", "Span"], fixedByDefault: { HillSlope: -1 } }),
    legacy("log_agonist_vs_response_4pl",
      "log(agonist) vs. response -- Variable slope (four parameters)", F_STIM,
      "log[Agonist]", true, ["Top", "Bottom", "LogEC50", "HillSlope"],
      { equation: LOG4A, derived: ["EC50", "Span"] }),
    legacy("log_agonist_vs_response_3pl",
      "log(agonist) vs. response -- (three parameters)", F_STIM,
      "log[Agonist]", true, ["Top", "Bottom", "LogEC50", "HillSlope"],
      { equation: LOG4A, derived: ["EC50", "Span"], fixedByDefault: { HillSlope: 1 } }),
    legacy("michaelis_menten", "Michaelis-Menten", F_ENZ, "[Substrate]", false,
      ["Vmax", "Km"], { equation: "Y = Vmax*X/(Km + X)" }),
    legacy("one_site_competition", "One site -- Fit logIC50", F_COMP,
      "log[Competitor]", true, ["Top", "Bottom", "LogIC50"],
      { equation: "Y=Bottom + (Top-Bottom)/(1+10^(X-LogIC50))", derived: ["IC50", "Span"] }),
    legacy("one_site_fit_ki", "One site -- Fit Ki", F_COMP, "log[Competitor]", true,
      ["Top", "Bottom", "LogKi", "HotNM", "HotKdNM"],
      { constants: ["HotNM", "HotKdNM"], derived: ["Ki", "Span"],
        equation: "logEC50=log(10^logKi*(1+HotnM/HotKdnM)); "
          + "Y=Bottom + (Top-Bottom)/(1+10^(X-logEC50))" }),
    legacy("two_site_competition", "Two sites -- Fit logIC50", F_COMP,
      "log[Competitor]", true,
      ["Top", "Bottom", "FracHi", "LogIC50_HiAff", "LogIC50_LoAff"],
      { derived: ["IC50_HiAff", "IC50_LoAff", "Span"] }),
    legacy("saturation_binding", "One site -- Specific binding", F_SAT, "[Ligand]",
      false, ["Bmax", "Kd"], { equation: "Y = Bmax*X/(Kd + X)" }),
    legacy("one_phase_decay", "One phase decay", "Exponential", "Time", false,
      ["Y0", "Plateau", "K"], { equation: "Y=(Y0-Plateau)*exp(-K*X) + Plateau",
        derived: ["HalfLife", "Tau", "Span"] }),
    legacy("one_phase_association", "One phase association", "Exponential", "Time",
      false, ["Y0", "Plateau", "K"], { equation: "Y=Y0 + (Plateau-Y0)*(1-exp(-K*X))",
        derived: ["HalfLife", "Tau", "Span"] }),
    legacy("exponential_growth", "Exponential growth", "Exponential", "Time", false,
      ["Y0", "K"], { equation: "Y=Y0*exp(K*X)", derived: ["DoublingTime"] }),
    legacy("two_phase_decay", "Two phase decay", "Exponential", "Time", false,
      ["Y0", "Plateau", "PercentFast", "KFast", "KSlow"],
      { derived: ["HalfLifeFast", "HalfLifeSlow"] }),
    legacy("polynomial_second", "Second order polynomial", "Polynomial", "X", false,
      ["B0", "B1", "B2"], { equation: "Y = B0 + B1*X + B2*X^2" }),
    legacy("polynomial_third", "Third order polynomial", "Polynomial", "X", false,
      ["B0", "B1", "B2", "B3"], { equation: "Y = B0 + B1*X + B2*X^2 + B3*X^3" }),
    legacy("straight_line", "Straight line (via nonlinear engine)", "Lines", "X", false,
      ["Slope", "Yintercept"], { equation: "Y = Slope*X + Yintercept" }),
    classicShift(),
  ];
}

function classicShift(): ModelMeta {
  return {
    id: CLASSIC_SHIFT_ID, engineId: CLASSIC_SHIFT_ID,
    label: "EC50 shift (Gaddum/Schild) from typed-in antagonist concentrations",
    family: F_SPECIAL_LOG, xLabel: "log[Agonist]", needsLogX: true,
    constrainable: ["Top", "Bottom", "HillSlope"],
    parameters: ["Top", "Bottom", "LogEC50", "HillSlope", "pA2", "SchildSlope"],
    equation: "Antag=1+(B/10^(-pA2))^SchildSlope; "
      + "Y=Bottom + (Top-Bottom)/(1+10^((log(EC50*Antag)-X)*HillSlope))",
    derived: ["EC50 (this curve)", "Dose ratio"],
    special: "gaddum_schild_classic", legacy: true,
  };
}

/** Engine entry -> UI metadata. */
export function metaFromEngine(m: EngineModelEntry): ModelMeta {
  const id = LIBRARY_ALIAS[m.id] ?? m.id;
  const required = m.required_constants ?? [];
  return {
    id, engineId: m.id, label: m.label, family: m.family,
    xLabel: m.x_label || "X", yLabel: m.y_label, needsLogX: !!m.has_log_x,
    constrainable: m.constrainable ?? m.parameters,
    ...(required.length ? { constants: required } : {}),
    equation: m.equation, parameters: m.parameters, derived: m.derived ?? [],
    datasetConstants: m.dataset_constants ?? [],
    shared: m.shared ?? [], paramScope: m.param_scope ?? {},
    globalOnly: !!m.global_only, fixedByDefault: m.fixed_by_default ?? {},
    ...(LEGACY_MODEL_IDS.has(m.id) ? { legacy: true } : {}),
  };
}

// ------------------------------------------------------------ live registry

/** Model id -> metadata. Mutated in place at engine boot so every module
 *  that imported it sees the library. */
export const MODELS_META: Record<string, ModelMeta> = {};
/** Family names in the engine's order. Mutated in place at boot. */
export const MODEL_FAMILIES: string[] = [];

let version = 0;
const listeners = new Set<() => void>();

function install(list: ModelMeta[], families?: string[]) {
  for (const k of Object.keys(MODELS_META)) delete MODELS_META[k];
  for (const m of list) MODELS_META[m.id] = m;
  const fams = families?.length ? [...families] : [];
  for (const m of list) if (!fams.includes(m.family)) fams.push(m.family);
  MODEL_FAMILIES.splice(0, MODEL_FAMILIES.length, ...fams);
  version += 1;
  for (const fn of listeners) fn();
}

install(fallbackModels());

/** Fill the registry from a `list_models` result. Keeps the fallback
 *  entries the engine does not list (the classic EC50-shift path), and
 *  the fallback when the result is unusable. Returns the model count. */
export function applyModelList(result: unknown): number {
  const r = result as { models?: EngineModelEntry[]; families?: string[] } | null;
  if (!r || !Array.isArray(r.models) || !r.models.length) return 0;
  const list = r.models.filter((m) => m && typeof m.id === "string").map(metaFromEngine);
  const have = new Set(list.map((m) => m.id));
  for (const f of fallbackModels()) if (!have.has(f.id)) list.push(f);
  install(list, r.families);
  return list.length;
}

/** Bumped every time the registry changes (for useSyncExternalStore). */
export function modelLibraryVersion(): number { return version; }
export function subscribeModelLibrary(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Metadata of a model id, falling back to the reference 4PL. */
export function modelMeta(id: string | undefined | null): ModelMeta {
  return (id && MODELS_META[id]) || MODELS_META.log_inhibitor_vs_response_4pl
    || fallbackModels()[0];
}

/** Models grouped by family, in the engine's family order. */
export function modelsByFamily(): { family: string; models: ModelMeta[] }[] {
  const groups = new Map<string, ModelMeta[]>();
  for (const f of MODEL_FAMILIES) groups.set(f, []);
  for (const m of Object.values(MODELS_META)) {
    if (!groups.has(m.family)) groups.set(m.family, []);
    groups.get(m.family)!.push(m);
  }
  return [...groups].filter(([, ms]) => ms.length)
    .map(([family, models]) => ({ family, models }));
}

/** Case-insensitive search over label, family, id, equation and
 *  parameter names; every word must match somewhere. */
export function searchModels(query: string): { family: string; models: ModelMeta[] }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = modelsByFamily();
  if (!words.length) return groups;
  return groups.map(({ family, models }) => ({
    family,
    models: models.filter((m) => {
      const hay = [m.label, m.family, m.id, m.equation ?? "",
        ...(m.parameters ?? []), ...(m.derived ?? [])].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    }),
  })).filter((g) => g.models.length);
}

/** Parameters the user may share between data sets for this model. */
export function shareableParams(m: ModelMeta): string[] {
  const scoped = new Set(Object.keys(m.paramScope ?? {}));
  const consts = new Set([...(m.datasetConstants ?? []), ...(m.constants ?? [])]);
  return m.constrainable.filter((p) => !scoped.has(p) && !consts.has(p));
}

/** Which engine path fits this model. */
export type FitRoute = "classic_shift" | "dose_response" | "global_fit" | "global_model_fit";

export function fitRoute(m: ModelMeta, sharedParams: string[]): FitRoute {
  if (m.special === "gaddum_schild_classic") return "classic_shift";
  if (m.globalOnly || (m.datasetConstants?.length ?? 0) > 0) return "global_model_fit";
  if (sharedParams.length) return m.legacy ? "global_fit" : "global_model_fit";
  return "dose_response";
}

/** Friendly labels of common experimental constants. */
export const CONSTANT_LABELS: Record<string, string> = {
  HotNM: "Hot ligand concentration (nM)",
  HotKdNM: "Kd of the hot ligand (nM)",
  HotKdNMHi: "Kd of the hot ligand, high-affinity site (nM)",
  HotKdNMLo: "Kd of the hot ligand, low-affinity site (nM)",
  Hotnm: "Hot ligand concentration (nM)",
  RadioligandNM: "Radioligand concentration (nM)",
  F: "F, the response level in percent (e.g. 80 for EC80)",
  Baseline: "Baseline (the Y value that defines the absolute IC50)",
  Et: "Total enzyme concentration (Et)",
  SpAct: "Specific activity (cpm/fmol)",
  Vol: "Incubation volume (ml)",
  Koff: "Dissociation rate constant Koff",
  Time0: "Time when dissociation starts",
  N: "Total number of values (N)",
  Km: "Km (known)",
  S: "Substrate concentration S",
};
