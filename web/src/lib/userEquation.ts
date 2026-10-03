// User-defined equations: the editor's model of one equation, the engine
// payload it becomes (dose_response / global_model_fit `user_equation`,
// validate_equation), initial-value suggestions, and the browser's
// "My equations" library (localStorage, every access guarded). Pure apart
// from the guarded storage, so it is unit-tested with node --test.

/** Data-derived quantities an initial-value rule can scale (engine
 *  opendose.userequation.RULE_KEYS). */
export const RULE_SOURCES = [
  "YMIN", "YMAX", "YMID", "XMIN", "XMAX", "XMID",
  "XATYMID", "XATYMAX", "XATYMIN", "YATXMID", "YATXMIN", "YATXMAX",
  "SIGN", "SLOPEATXMIN", "SLOPEATXMID", "SLOPEATXMAX",
  "COLUMNTITLEMEAN", "LOGCOLUMNTITLEMEAN",
] as const;
export type RuleSource = typeof RULE_SOURCES[number];

export const RULE_SOURCE_LABELS: Record<RuleSource, string> = {
  YMIN: "YMIN (smallest Y)", YMAX: "YMAX (largest Y)", YMID: "YMID (mean of YMIN and YMAX)",
  XMIN: "XMIN (smallest X)", XMAX: "XMAX (largest X)", XMID: "XMID (mean of XMIN and XMAX)",
  XATYMID: "X at YMID", XATYMAX: "X at YMAX", XATYMIN: "X at YMIN",
  YATXMID: "Y at XMID", YATXMIN: "Y at XMIN", YATXMAX: "Y at XMAX",
  SIGN: "SIGN (sign of Y at XMAX − Y at XMIN)",
  SLOPEATXMIN: "Slope at XMIN", SLOPEATXMID: "Slope at XMID", SLOPEATXMAX: "Slope at XMAX",
  COLUMNTITLEMEAN: "Mean of the column titles",
  LOGCOLUMNTITLEMEAN: "Log of the mean of the column titles",
};

/** Initial value of one parameter: a number, or k × / ÷ a data quantity. */
export interface InitialRule {
  kind: "value" | "rule";
  value: string;          // the number, or the multiplier k
  op: "*" | "/";
  of: RuleSource;
}

export type ConstraintKind =
  | "none" | "constant" | "positive" | "greater" | "less" | "between"
  | "shared" | "column";

export const CONSTRAINT_LABELS: Record<ConstraintKind, string> = {
  none: "No constraint",
  constant: "Constant equal to",
  positive: "Must be greater than 0",
  greater: "Must be greater than",
  less: "Must be less than",
  between: "Must be between",
  shared: "Shared value for all data sets",
  column: "Data set constant (one value per data set)",
};

export interface DefaultConstraint {
  kind: ConstraintKind;
  value: string;   // constant (blank: entered when fitting)
  min: string;
  max: string;
}

export type TransformCI = "asymmetrical" | "symmetrical" | "none";

/** A value to report, computed from the fitted parameters. */
export interface TransformDef { name: string; expr: string; ci: TransformCI }

export interface UserEquationDef {
  id: string;
  name: string;
  /** Y = ... (several lines allowed). */
  text: string;
  /** X in the equation is log10(concentration). */
  xIsLog: boolean;
  rules: Record<string, InitialRule>;
  constraints: Record<string, DefaultConstraint>;
  transforms: TransformDef[];
}

export const FOUR_PL_TEXT = "Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))";

export function newEquation(): UserEquationDef {
  return {
    id: "", name: "", text: "", xIsLog: false,
    rules: {}, constraints: {}, transforms: [],
  };
}

const NONE: DefaultConstraint = { kind: "none", value: "", min: "", max: "" };
export function noConstraint(): DefaultConstraint { return { ...NONE }; }

/** A sensible starting rule from the parameter's name (the user can
 *  change it): plateaus from the Y range, midpoints from the X range,
 *  slopes from the direction of the data. */
export function suggestRule(name: string): InitialRule {
  const n = name.toLowerCase();
  const rule = (of: RuleSource, value = "1", op: "*" | "/" = "*"): InitialRule =>
    ({ kind: "rule", value, op, of });
  if (/^(top|max|ymax|bmax|vmax|emax|effectmax|plateau_?hi)$/.test(n)) return rule("YMAX");
  if (/^(bottom|min|ymin|baseline|basal|nsb|background|plateau)$/.test(n)) return rule("YMIN");
  if (/^log(ic|ec|ld|ed|xb)?\d*$|^log(ic|ec)\w*$/.test(n)) return rule("XATYMID");
  if (/^(ic|ec)\d+$|^(km|kd|ka|ki|xmid|x50|xhalf|v50)$/.test(n)) return rule("XMID");
  if (/hill|^slope$|^h$|^n$/.test(n)) return rule("SIGN");
  if (/^y0$/.test(n)) return rule("YATXMIN");
  if (/^k(off|on|fast|slow)?$|rate/.test(n)) return rule("XMID", "1", "/");
  return { kind: "value", value: "1", op: "*", of: "YMAX" };
}

// ------------------------------------------------------------ payloads

const sameName = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Rules and constraints for exactly these parameters (new ones get a
 *  suggested rule and no constraint). */
export function materialize(def: UserEquationDef, params: string[]): UserEquationDef {
  const rules: Record<string, InitialRule> = {};
  const constraints: Record<string, DefaultConstraint> = {};
  for (const p of params) {
    const rk = Object.keys(def.rules).find((k) => sameName(k, p));
    rules[p] = rk ? def.rules[rk] : suggestRule(p);
    const ck = Object.keys(def.constraints).find((k) => sameName(k, p));
    const c = ck ? def.constraints[ck] : null;
    if (c && c.kind !== "none") constraints[p] = c;
  }
  return { ...def, rules, constraints };
}


function num(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Engine form of the initial-value rules ({param: number | "k*SRC"}). */
export function rulesPayload(def: UserEquationDef, params?: string[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [p, r] of Object.entries(def.rules)) {
    if (params && !params.includes(p)) continue;
    if (r.kind === "value") {
      const v = num(r.value);
      if (v !== null) out[p] = v;
    } else {
      const k = num(r.value) ?? 1;
      out[p] = `${k}${r.op}${r.of}`;
    }
  }
  return out;
}

/** Engine form of the default constraints. A constant without a value is
 *  an experimental constant entered when fitting (engine "constant"). */
export function constraintsPayload(def: UserEquationDef, params?: string[]):
  Record<string, number | string | Record<string, unknown>> {
  const out: Record<string, number | string | Record<string, unknown>> = {};
  for (const [p, c] of Object.entries(def.constraints)) {
    if (params && !params.includes(p)) continue;
    switch (c.kind) {
      case "constant": {
        const v = num(c.value);
        out[p] = v === null ? "constant" : v;
        break;
      }
      case "positive": out[p] = ">0"; break;
      case "greater": {
        const v = num(c.min);
        if (v !== null) out[p] = `>${v}`;
        break;
      }
      case "less": {
        const v = num(c.max);
        if (v !== null) out[p] = `<${v}`;
        break;
      }
      case "between": {
        const lo = num(c.min), hi = num(c.max);
        if (lo !== null || hi !== null) {
          out[p] = { type: "range", ...(lo !== null ? { min: lo } : {}),
            ...(hi !== null ? { max: hi } : {}) };
        }
        break;
      }
      case "shared": out[p] = "shared"; break;
      case "column": out[p] = "column"; break;
      default: break;
    }
  }
  return out;
}

export function transformsPayload(def: UserEquationDef): TransformDef[] {
  return def.transforms
    .filter((t) => t.name.trim() && t.expr.trim())
    .map((t) => ({ name: t.name.trim(), expr: t.expr, ci: t.ci }));
}

/** The `user_equation` option of dose_response / global_model_fit, and
 *  the options of validate_equation. */
export function userEquationPayload(def: UserEquationDef, params?: string[]) {
  return {
    text: def.text,
    name: def.name.trim() || "User-defined equation",
    x_is_log: def.xIsLog,
    rules: rulesPayload(def, params),
    constraints: constraintsPayload(def, params),
    transforms: transformsPayload(def),
  };
}

const kindsOf = (def: UserEquationDef, kind: ConstraintKind, params?: string[]) =>
  Object.entries(def.constraints)
    .filter(([p, c]) => c.kind === kind && (!params || params.includes(p)))
    .map(([p]) => p);

/** Parameters held constant at a value entered when fitting. */
export function requiredConstants(def: UserEquationDef, params?: string[]): string[] {
  return kindsOf(def, "constant", params)
    .filter((p) => num(def.constraints[p].value) === null);
}
export function columnConstants(def: UserEquationDef, params?: string[]): string[] {
  return kindsOf(def, "column", params);
}
export function sharedParameters(def: UserEquationDef, params?: string[]): string[] {
  return kindsOf(def, "shared", params);
}
/** Parameters the fit estimates freely (no constant / column default). */
export function freeParameters(def: UserEquationDef, params: string[]): string[] {
  return params.filter((p) => {
    const k = def.constraints[p]?.kind ?? "none";
    return k !== "constant" && k !== "column";
  });
}

/** Parameter names as written in the equation: names first seen on the
 *  right of "=" (a rough, engine-independent reading used only until the
 *  engine's validation answers). */
export function guessParameters(text: string): string[] {
  const assigned = new Set<string>(["X", "Y"]);
  const params: string[] = [];
  const seen = new Set<string>();
  const funcs = /^(abs|and|exp|ln|log|log2|log10|sqrt|sqr|sin|cos|tan|if|or|not|min|max|int|pow|sinh|cosh|tanh|arctan|arcsin|arccos|erf|erfc|gamma|deg|rad|floor|ceil|round|sgn|zdist|normdist)$/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split(";")[0].replace(/^\s*<[^>]*>\s*/, "");
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const lhs = line.slice(0, eq).trim();
    const rhs = line.slice(eq + 1);
    for (const m of rhs.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      const name = m[0];
      const up = name.toUpperCase();
      const after = rhs.slice((m.index ?? 0) + name.length).trimStart();
      if (after.startsWith("(") && funcs.test(name)) continue;
      if (assigned.has(up) || seen.has(up)) continue;
      if (/^\d/.test(name)) continue;
      seen.add(up);
      params.push(name);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(lhs)) assigned.add(lhs.toUpperCase());
  }
  return params;
}

// ------------------------------------------------------------ library

const STORE_KEY = "opendose.userEquations.v1";
const listeners = new Set<() => void>();
let cache: UserEquationDef[] | null = null;

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Repair an equation read from storage or an imported file. */
export function normalizeEquation(raw: unknown): UserEquationDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<UserEquationDef> & { equation?: string };
  const text = typeof r.text === "string" ? r.text
    : typeof r.equation === "string" ? r.equation : "";
  if (!text.trim()) return null;
  const rules: Record<string, InitialRule> = {};
  for (const [p, v] of Object.entries(r.rules ?? {})) {
    const x = v as Partial<InitialRule> | number | string;
    if (typeof x === "number") rules[p] = { kind: "value", value: String(x), op: "*", of: "YMAX" };
    else if (typeof x === "string") {
      const m = /^\s*([-+0-9.eE]*)\s*([*/])?\s*([A-Za-z]+)\s*$/.exec(x);
      if (m && (RULE_SOURCES as readonly string[]).includes(m[3].toUpperCase())) {
        rules[p] = { kind: "rule", value: m[1] || "1", op: (m[2] as "*" | "/") ?? "*",
          of: m[3].toUpperCase() as RuleSource };
      } else rules[p] = { kind: "value", value: x, op: "*", of: "YMAX" };
    } else if (x && typeof x === "object") {
      rules[p] = {
        kind: x.kind === "rule" ? "rule" : "value",
        value: String(x.value ?? "1"),
        op: x.op === "/" ? "/" : "*",
        of: (RULE_SOURCES as readonly string[]).includes(String(x.of)) ? x.of as RuleSource : "YMAX",
      };
    }
  }
  const constraints: Record<string, DefaultConstraint> = {};
  for (const [p, v] of Object.entries(r.constraints ?? {})) {
    const c = v as Partial<DefaultConstraint>;
    if (!c || typeof c !== "object" || !(c.kind && c.kind in CONSTRAINT_LABELS)) continue;
    constraints[p] = { kind: c.kind, value: String(c.value ?? ""),
      min: String(c.min ?? ""), max: String(c.max ?? "") };
  }
  const transforms = Array.isArray(r.transforms) ? r.transforms
    .filter((t) => t && typeof t === "object" && typeof t.name === "string")
    .map((t) => ({ name: t.name, expr: String(t.expr ?? ""),
      ci: (["asymmetrical", "symmetrical", "none"].includes(t.ci) ? t.ci : "asymmetrical") as TransformCI }))
    : [];
  return {
    id: typeof r.id === "string" ? r.id : "",
    name: typeof r.name === "string" ? r.name : "",
    text, xIsLog: !!r.xIsLog, rules, constraints, transforms,
  };
}

export function savedEquations(): UserEquationDef[] {
  if (cache) return cache;
  let list: UserEquationDef[] = [];
  try {
    const raw = JSON.parse(storage()?.getItem(STORE_KEY) ?? "null");
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.equations) ? raw.equations : [];
    list = arr.map(normalizeEquation).filter((e: UserEquationDef | null): e is UserEquationDef => !!e);
  } catch { list = []; }
  cache = list;
  return list;
}

function persist(list: UserEquationDef[]) {
  cache = list;
  try { storage()?.setItem(STORE_KEY, JSON.stringify({ version: 1, equations: list })); }
  catch { /* storage full or blocked: the list still lives for this session */ }
  for (const fn of listeners) fn();
}

function newId(): string {
  return `eq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Add or replace (same id) an equation; returns it with its id. */
export function saveEquation(def: UserEquationDef): UserEquationDef {
  const list = savedEquations();
  const withId = { ...def, id: def.id || newId() };
  const i = list.findIndex((e) => e.id === withId.id);
  persist(i >= 0 ? list.map((e, j) => (j === i ? withId : e)) : [...list, withId]);
  return withId;
}

export function deleteEquation(id: string) {
  persist(savedEquations().filter((e) => e.id !== id));
}

export function exportEquations(list = savedEquations()): string {
  return JSON.stringify({ format: "opendose-equations", version: 1, equations: list }, null, 2);
}

/** Read equations from an exported file; returns how many were added. */
export function importEquations(text: string): number {
  const raw = JSON.parse(text);
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.equations) ? raw.equations : null;
  if (!arr) throw new Error("not an equations file");
  const list = savedEquations();
  const ids = new Set(list.map((e) => e.id));
  const added = arr.map(normalizeEquation)
    .filter((e: UserEquationDef | null): e is UserEquationDef => !!e)
    .map((e: UserEquationDef) => ({ ...e, id: e.id && !ids.has(e.id) ? e.id : newId() }));
  if (added.length) persist([...list, ...added]);
  return added.length;
}

export function subscribeEquations(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
