// Preferences: stored per browser (localStorage, every access guarded so
// private windows and blocked storage just fall back to defaults).
import { DEFAULT_SCHEME, isSchemeId } from "../lib/palette.ts";
import { sanitizeExport } from "../export/settings.ts";
import { sanitizeReport } from "../report/prefs.ts";
import { isTableType, type Prefs, type ProjectPrefs } from "./types.ts";

export const DEFAULT_PREFS: Prefs = {
  defaultTableType: "xy",
  errorBars: "sd",
  ciMethod: "asymptotic",
  scheme: DEFAULT_SCHEME,
  theme: "auto",
  digits: 4,
};

const KEY = "opendose-prefs";

const ERROR_BARS = ["sd", "sem", "ci95", "range", "none"];

export function sanitizePrefs(raw: unknown, base: Prefs = DEFAULT_PREFS): Prefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    defaultTableType: isTableType(r.defaultTableType) ? r.defaultTableType : base.defaultTableType,
    errorBars: typeof r.errorBars === "string" && ERROR_BARS.includes(r.errorBars)
      ? r.errorBars as Prefs["errorBars"] : base.errorBars,
    ciMethod: r.ciMethod === "profile" || r.ciMethod === "asymptotic" ? r.ciMethod : base.ciMethod,
    scheme: isSchemeId(r.scheme) ? r.scheme : base.scheme,
    theme: r.theme === "light" || r.theme === "dark" || r.theme === "auto" ? r.theme : base.theme,
    digits: typeof r.digits === "number" && r.digits >= 2 && r.digits <= 10
      ? Math.round(r.digits) : base.digits,
    ...(r.export !== undefined ? { export: sanitizeExport(r.export) }
      : base.export ? { export: base.export } : {}),
    ...(r.report !== undefined ? { report: sanitizeReport(r.report) }
      : base.report ? { report: base.report } : {}),
  };
}

function safeGet(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

export function loadPrefs(): Prefs {
  // Older builds kept theme and scheme under their own keys.
  const legacy: Partial<Prefs> = {};
  const theme = safeGet("opendose-theme");
  if (theme === "light" || theme === "dark" || theme === "auto") legacy.theme = theme;
  const scheme = safeGet("opendose-scheme");
  if (isSchemeId(scheme)) legacy.scheme = scheme;
  let stored: unknown = null;
  try { stored = JSON.parse(safeGet(KEY) ?? "null"); } catch { stored = null; }
  return sanitizePrefs(stored, { ...DEFAULT_PREFS, ...legacy });
}

export function savePrefs(p: Prefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
    globalThis.localStorage?.setItem("opendose-theme", p.theme);
  } catch { /* storage unavailable: preferences last for this session */ }
}

export function projectPrefs(p: Prefs): ProjectPrefs {
  const { theme: _theme, ...rest } = p;
  void _theme;
  return rest;
}
