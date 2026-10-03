// X columns that hold dates or elapsed times. Values stay in the table
// exactly as typed; this module reads them into numbers for analyses and
// graphs (days since the earliest date, or the elapsed time, in the
// table's chosen unit) and formats them for display. Pure, no DOM.
import type { DataTableModel, DateOrder, XTimeUnit } from "./types.ts";

const SEC: Record<XTimeUnit, number> = {
  seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800,
  years: 365.25 * 86400,
};

export const TIME_UNIT_LABELS: Record<XTimeUnit, string> = {
  seconds: "Seconds", minutes: "Minutes", hours: "Hours", days: "Days",
  weeks: "Weeks", years: "Years (365.25 days)",
};

export function defaultTimeUnit(xFormat: DataTableModel["xFormat"]): XTimeUnit {
  return xFormat === "dates" ? "days" : "seconds";
}

/** Day/month order a browser's language implies (US-style languages read
 *  1/2/2024 as January 2). */
export function localeDateOrder(lang?: string): DateOrder {
  const l = lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-GB");
  return /^en-(US|PH|CA)|^(fil|es-US)/i.test(l ?? "") ? "mdy" : "dmy";
}

// ------------------------------------------------------------ elapsed time

/** Elapsed time -> seconds. Accepts h:mm:ss(.s), h:mm (or m:ss when
 *  twoPart is "ms"), d:hh:mm:ss, a number with a unit (90 s, 1.5 h,
 *  2 d, 30 min) and a plain number, read as decimal hours. A leading
 *  minus sign is allowed. Returns null for anything else. */
export function parseElapsed(raw: string, twoPart: "hm" | "ms" = "hm"): number | null {
  let s = raw.trim().replace(",", ".");
  if (!s) return null;
  let sign = 1;
  if (s.startsWith("-") || s.startsWith("−")) { sign = -1; s = s.slice(1).trim(); }
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p.trim()))) return null;
    const n = parts.map(Number);
    let sec: number;
    if (n.length === 2) {
      sec = twoPart === "ms" ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60;
      if (n[1] >= 60) return null;
    } else if (n.length === 3) {
      if (n[1] >= 60 || n[2] >= 60) return null;
      sec = n[0] * 3600 + n[1] * 60 + n[2];
    } else if (n.length === 4) {
      if (n[1] >= 24 || n[2] >= 60 || n[3] >= 60) return null;
      sec = n[0] * 86400 + n[1] * 3600 + n[2] * 60 + n[3];
    } else return null;
    return sign * sec;
  }
  const m = s.match(/^(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?\s*([a-zA-Z]*)$/);
  if (!m) return null;
  const v = Number(m[1]) * (m[2] ? 10 ** Number(m[2]) : 1);
  const unit = m[3].toLowerCase();
  const mult = unit === "" || /^(h|hr|hrs|hour|hours)$/.test(unit) ? 3600
    : /^(s|sec|secs|second|seconds)$/.test(unit) ? 1
      : /^(m|min|mins|minute|minutes)$/.test(unit) ? 60
        : /^(d|day|days)$/.test(unit) ? 86400
          : /^(w|wk|wks|week|weeks)$/.test(unit) ? 604800 : null;
  return mult === null ? null : sign * v * mult;
}

/** Seconds -> "h:mm:ss" (fractional seconds kept, up to 3 decimals). */
export function formatElapsed(sec: number): string {
  const neg = sec < 0;
  let s = Math.abs(sec);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s = Math.round((s - m * 60) * 1000) / 1000;
  const ss = s < 10 ? `0${s}` : String(s);
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}:${ss}`;
}

// ------------------------------------------------------------ dates

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep",
  "oct", "nov", "dec"];

function monthIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  const i = MONTHS.indexOf(w === "sept" ? "sep" : w);
  return i;
}

function fullYear(y: number, digits: number): number {
  if (digits > 2) return y;
  return y < 50 ? 2000 + y : 1900 + y;
}

function utcDays(y: number, mo: number, d: number, timeSec = 0): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // reject 31/02 etc. (Date.UTC rolls over silently)
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms / 86400000 + timeSec / 86400;
}

function timeOfDay(t: string | undefined): number | null {
  if (!t) return 0;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[4]) {
    if (h > 12) return null;
    h = (h % 12) + (m[4].toLowerCase() === "pm" ? 12 : 0);
  }
  if (h > 23) return null;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** A date (optionally with a time of day) -> days since 1970-01-01 UTC.
 *  Accepts ISO 2024-03-05 (and 2024/03/05, 2024-03-05T14:30), numeric
 *  dates with / - or . read in `order` (2-digit years: 00-49 -> 2000s),
 *  and month names: 5 Mar 2024, March 5, 2024, Mar-5-24. */
export function parseDate(raw: string, order: DateOrder = "dmy"): number | null {
  const s = raw.trim();
  if (!s) return null;
  // split off a trailing time of day
  const tm = s.match(/^(.*?)(?:[T\s]+(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:am|pm)?))?$/i);
  const datePart = (tm?.[1] ?? s).trim().replace(/,/g, " ");
  const time = timeOfDay(tm?.[2]);
  if (time === null) return null;
  let m = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return utcDays(Number(m[1]), Number(m[2]), Number(m[3]), time);
  m = datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(Number(m[3]), m[3].length);
    // an impossible reading falls back to the other order (13/1 is a day)
    const first = order === "dmy" ? utcDays(y, b, a, time) : utcDays(y, a, b, time);
    if (first !== null) return first;
    return order === "dmy" ? utcDays(y, a, b, time) : utcDays(y, b, a, time);
  }
  const words = datePart.split(/[\s\-/.]+/).filter(Boolean);
  if (words.length === 3) {
    const [p, q, r] = words;
    let mo = monthIndex(p);
    if (mo >= 0 && /^\d{1,2}$/.test(q) && /^\d{2}(\d{2})?$/.test(r)) {
      return utcDays(fullYear(Number(r), r.length), mo + 1, Number(q), time);
    }
    mo = monthIndex(q);
    if (mo >= 0 && /^\d{1,2}$/.test(p) && /^\d{2}(\d{2})?$/.test(r)) {
      return utcDays(fullYear(Number(r), r.length), mo + 1, Number(p), time);
    }
  }
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Days since 1970-01-01 UTC -> "2024-03-05" (with " 14:30" when the
 *  value carries a time of day). */
export function formatDate(days: number): string {
  const d = new Date(Math.round(days * 86400) * 1000);
  const base = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const secs = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  if (!secs) return base;
  return `${base} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
    + (d.getUTCSeconds() ? `:${pad2(d.getUTCSeconds())}` : "");
}

// ------------------------------------------------------------ table level

/** The raw seconds (elapsed) or days-since-epoch (dates) of one X cell. */
function rawValue(t: DataTableModel, v: string): number | null {
  if (t.xFormat === "dates") return parseDate(v, t.xDateOrder ?? localeDateOrder());
  if (t.xFormat === "elapsed") return parseElapsed(v, t.xElapsedTwoPart ?? "hm");
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Origin of a dates column: the earliest date in it (in days). */
export function dateOrigin(t: DataTableModel): number | null {
  let min: number | null = null;
  for (const v of t.x) {
    const d = rawValue(t, v);
    if (d !== null && (min === null || d < min)) min = d;
  }
  return min;
}

/** X values as analyses see them: numbers as typed; dates as time since
 *  the earliest date and elapsed times, both in the table's unit. */
export function xNumbers(t: DataTableModel): (number | null)[] {
  if (t.xFormat === "numbers") return t.x.map((v) => rawValue(t, v));
  const unit = t.xTimeUnit ?? defaultTimeUnit(t.xFormat);
  if (t.xFormat === "elapsed") {
    return t.x.map((v) => {
      const s = rawValue(t, v);
      return s === null ? null : s / SEC[unit];
    });
  }
  const origin = dateOrigin(t);
  return t.x.map((v) => {
    const d = rawValue(t, v);
    return d === null || origin === null ? null : ((d - origin) * 86400) / SEC[unit];
  });
}

/** True when a non-blank X cell cannot be read in the table's X format. */
export function xInvalid(t: DataTableModel, v: string): boolean {
  return v.trim() !== "" && rawValue(t, v) === null;
}

/** How an X cell is shown when it is not being edited. */
export function xDisplay(t: DataTableModel, v: string): string {
  if (t.xFormat === "numbers" || !v.trim()) return v;
  const r = rawValue(t, v);
  if (r === null) return v;
  return t.xFormat === "dates" ? formatDate(r) : formatElapsed(r);
}

/** Formatter for axis ticks of an analysis-unit X value (inverse of
 *  xNumbers), or null for plain numbers. */
export function xTickFormatter(t: DataTableModel): ((v: number) => string) | null {
  if (t.xFormat === "numbers") return null;
  const unit = t.xTimeUnit ?? defaultTimeUnit(t.xFormat);
  if (t.xFormat === "elapsed") return (v) => formatElapsed(v * SEC[unit]);
  const origin = dateOrigin(t);
  if (origin === null) return null;
  return (v) => formatDate(origin + (v * SEC[unit]) / 86400);
}

/** About `count` round tick positions spanning [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 6): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) return [lo];
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Number(v.toPrecision(12)));
  }
  return out;
}
