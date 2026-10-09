// Survival data entry from the shapes bench data come in, expanded to the
// one-row-per-subject layout the survival table holds (Time, Event with
// 1 = event, 0 = censored, as the GraphPad statistics guide's survival
// tables), and the "read as" wording that shows how each row is read:
//
//   counts per day  time in the first column, then per group the number
//                   still alive at that time (or the number that died at
//                   that time). A fall in the alive count from one time to
//                   the next is that many deaths at the later time; the
//                   subjects still alive at a group's last recorded time
//                   are censored there.
//   dates           a start date (a column, or one date for everyone), an
//                   event-or-last-seen date and an event code (1/0, yes/no,
//                   dead/alive, death/censored, true/false); the time is
//                   the difference in days, weeks, months or years.
//
// Pure and unit-tested (__tests__/entry.test.ts). No statistics here: the
// rows written are exactly the subjects the counts or dates describe.
import { detectDelimiter, splitDelimited } from "../../project/importText.ts";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel, DateOrder } from "../../project/types.ts";
import { parseDate } from "../../project/xformat.ts";

/** Time unit of a survival table (stored as the table's `xUnit`). */
export type TimeUnit = "" | "hours" | "days" | "weeks" | "months" | "years";

export const TIME_UNITS: { id: TimeUnit; label: string }[] = [
  { id: "", label: "Not stated" },
  { id: "hours", label: "Hours" },
  { id: "days", label: "Days" },
  { id: "weeks", label: "Weeks" },
  { id: "months", label: "Months" },
  { id: "years", label: "Years" },
];

/** Days per unit for dates (months and years as 365.25 / 12 and 365.25
 *  days, the usual convention of survival software). */
export const DAYS_PER: Record<Exclude<TimeUnit, "">, number> = {
  hours: 1 / 24, days: 1, weeks: 7, months: 365.25 / 12, years: 365.25,
};

export function timeUnitOf(t: DataTableModel): TimeUnit {
  const u = (t.xUnit ?? "").trim().toLowerCase();
  return (TIME_UNITS.some((x) => x.id === u) ? u : "") as TimeUnit;
}

/** A number for display: up to four decimals, no trailing zeros. */
export function fmtTime(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Math.round(v * 1e4) / 1e4;
  return String(Object.is(r, -0) ? 0 : r);
}

/** "day 12", "week 3.5", "time 12" (no unit stated). */
export function timePhrase(time: number, unit: TimeUnit): string {
  const t = fmtTime(time);
  if (!unit) return `time ${t}`;
  return `${unit.replace(/s$/, "")} ${t}`;
}

/** How one row is read: "death on day 12", "censored on day 30"
 *  (`eventWord` names the event: death, relapse, tumour onset, event). */
export function readAs(time: number, event: 0 | 1, unit: TimeUnit, eventWord = "death"): string {
  const when = unit ? `on ${timePhrase(time, unit)}` : `at ${timePhrase(time, unit)}`;
  return `${event === 1 ? eventWord : "censored"} ${when}`;
}

// ------------------------------------------------------------ event codes

const EVENT_WORDS = new Set(["1", "1.0", "yes", "y", "true", "dead", "died", "death",
  "deceased", "event", "events", "relapse", "relapsed", "progressed", "progression"]);
const CENSOR_WORDS = new Set(["0", "0.0", "no", "n", "false", "alive", "censored", "censor",
  "living", "lost", "survived", "survivor", "withdrawn"]);

/** 1 = event, 0 = censored, null = not a code we can read. Accepts 1/0
 *  (the convention of the GraphPad statistics guide's survival tables),
 *  yes/no, true/false, dead/alive, death/censored and similar words. */
export function parseEventCode(raw: string): 0 | 1 | null {
  const s = raw.trim().toLowerCase();
  if (EVENT_WORDS.has(s)) return 1;
  if (CENSOR_WORDS.has(s)) return 0;
  return null;
}

// ------------------------------------------------------------ parsing

/** Pasted text as a matrix of trimmed cells (tab, semicolon, comma or
 *  space separated; blank lines dropped). */
export function parseGrid(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim()).join("\n");
  if (!clean) return [];
  const rows = splitDelimited(clean, detectDelimiter(clean));
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/** A number in a cell: "12", "12.5", "12,5", "Day 12", "d12", "12 d". */
export function cellNumber(raw: string): number | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^(day|days|d|week|weeks|wk|w|month|months|mo|hour|hours|h|year|years|y)\s*/, "")
    .replace(/\s*(days|day|d|weeks|week|wk|w|months|month|mo|hours|hour|h|years|year|y)$/, "");
  if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

// ------------------------------------------------------------ output

/** One subject as it will be written. */
export interface Subject { group: string; time: number; event: 0 | 1 }

export interface EntryGroup { name: string; subjects: Subject[] }

export interface EntryFill {
  groups: EntryGroup[];
  /** "2 groups, 20 subjects: 14 deaths, 6 censored". */
  summary: string;
  /** Rules applied and rows left out, in words. */
  notes: string[];
}

export type EntryResult = EntryFill | { error: string };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function summarise(groups: EntryGroup[], eventWord: string): string {
  const all = groups.flatMap((g) => g.subjects);
  const ev = all.filter((s) => s.event === 1).length;
  const word = eventWord === "death" ? ["death", "deaths"] : [eventWord, `${eventWord}s`];
  return `${plural(groups.length, "group")}, ${plural(all.length, "subject")}: `
    + `${ev} ${ev === 1 ? word[0] : word[1]}, ${all.length - ev} censored`;
}

/** A survival table holding the subjects, one data set per group
 *  (Time, Event), keeping the display settings of `base`. Covariate
 *  columns are not carried over (their values would belong to other
 *  subjects). */
export function survivalTableFrom(base: DataTableModel, groups: EntryGroup[], unit: TimeUnit):
  DataTableModel {
  return normalizeTable({
    ...base,
    type: "survival",
    x: [],
    rowTitles: [],
    xExcluded: undefined,
    xUnit: unit,
    datasets: groups.map((g) => ({
      name: g.name,
      subTitles: ["Time", "Event"],
      rows: g.subjects.map((s) => [fmtTime(s.time), String(s.event)]),
    })),
  }, "survival");
}

// ------------------------------------------------------------ counts per day

export type CountKind = "alive" | "deaths";

export interface CountOptions {
  kind: CountKind;
  /** Deaths per day only: subjects per group at the start (one number
   *  for every group, or one per group). */
  startN?: number[];
  eventWord?: string;
}

const isHeaderCell = (c: string) => c !== "" && cellNumber(c) === null;

/** Counts per time -> one row per subject (see the file comment). The
 *  first column is the time; a first row with names in the count columns
 *  is the header (group names). */
export function countsToSubjects(m: string[][], o: CountOptions): EntryResult {
  if (!m.length) return { error: "Paste a table: time in the first column, then one column of counts per group." };
  const width = Math.max(...m.map((r) => r.length));
  if (width < 2) return { error: "Need at least two columns: the time, then the counts of a group (check the separator)." };
  const header = m[0].slice(1).some(isHeaderCell) || isHeaderCell(m[0][0] ?? "") ? m[0] : null;
  const body = header ? m.slice(1) : m;
  const names = Array.from({ length: width - 1 }, (_, g) =>
    (header?.[g + 1] ?? "").trim() || `Group ${String.fromCharCode(65 + (g % 26))}`);
  const eventWord = o.eventWord?.trim() || "death";
  const notes: string[] = [];

  // rows: time + counts (null = not recorded)
  const rows: { time: number; counts: (number | null)[]; line: number }[] = [];
  for (let i = 0; i < body.length; i++) {
    const r = body[i];
    const line = i + 1 + (header ? 1 : 0);
    const time = cellNumber(r[0] ?? "");
    if (time === null) {
      if (r.slice(1).every((c) => !c)) continue;
      return { error: `Row ${line}: “${r[0] ?? ""}” is not a time. The first column holds the time (day 0, 1, 2…).` };
    }
    const counts: (number | null)[] = [];
    for (let g = 0; g < width - 1; g++) {
      const c = (r[g + 1] ?? "").trim();
      if (!c) { counts.push(null); continue; }
      const v = cellNumber(c);
      if (v === null || v < 0 || !Number.isInteger(v)) {
        return { error: `Row ${line}, ${names[g]}: “${c}” is not a count (a whole number, 0 or more).` };
      }
      counts.push(v);
    }
    rows.push({ time, counts, line });
  }
  if (!rows.length) return { error: "No rows with a time and counts." };
  const sorted = rows.every((r, i) => i === 0 || r.time > rows[i - 1].time);
  if (!sorted) {
    const times = rows.map((r) => r.time);
    if (new Set(times).size !== times.length) {
      const dup = times.find((t, i) => times.indexOf(t) !== i);
      return { error: `Time ${fmtTime(dup ?? 0)} appears twice: one row per time.` };
    }
    rows.sort((a, b) => a.time - b.time);
    notes.push("Rows were put in time order.");
  }
  const lastTime = rows[rows.length - 1].time;

  const groups: EntryGroup[] = [];
  for (let g = 0; g < width - 1; g++) {
    const name = names[g];
    const subjects: Subject[] = [];
    if (o.kind === "alive") {
      let prev: number | null = null;
      let lastSeen = 0;
      for (const r of rows) {
        const a = r.counts[g];
        if (a === null) continue;
        if (prev !== null) {
          if (a > prev) {
            return { error: `${name}: the number alive rises from ${prev} to ${a} at ${fmtTime(r.time)}. `
              + "Alive counts can only stay the same or fall (did you mean deaths per day?)." };
          }
          for (let k = 0; k < prev - a; k++) subjects.push({ group: name, time: r.time, event: 1 });
        }
        prev = a;
        lastSeen = r.time;
      }
      if (prev === null) continue;
      for (let k = 0; k < prev; k++) subjects.push({ group: name, time: lastSeen, event: 0 });
    } else {
      const n = o.startN?.length ? (o.startN.length === 1 ? o.startN[0] : o.startN[g]) : undefined;
      if (n === undefined || !Number.isInteger(n) || n <= 0) {
        return { error: `Enter how many subjects ${name} had at the start (deaths per day needs it).` };
      }
      let dead = 0;
      for (const r of rows) {
        const d = r.counts[g] ?? 0;
        for (let k = 0; k < d; k++) subjects.push({ group: name, time: r.time, event: 1 });
        dead += d;
      }
      if (dead > n) {
        return { error: `${name}: ${dead} deaths but only ${n} subjects at the start.` };
      }
      for (let k = 0; k < n - dead; k++) subjects.push({ group: name, time: lastTime, event: 0 });
    }
    if (subjects.length) groups.push({ name, subjects });
  }
  if (!groups.length) return { error: "No counts found." };
  if (o.kind === "alive") {
    notes.push(`The first count of each group is the number at the start; each fall in the `
      + `number alive is that many ${eventWord === "death" ? "deaths" : `${eventWord}s`} at the later time; `
      + "the subjects still alive at a group's last recorded time are censored there.");
  } else {
    notes.push(`Blank cells are 0 ${eventWord === "death" ? "deaths" : `${eventWord}s`}; the subjects `
      + `that did not die are censored at the last time in the table (${fmtTime(lastTime)}).`);
  }
  return { groups, summary: summarise(groups, eventWord), notes };
}

// ------------------------------------------------------------ dates

export interface DateRoles {
  /** Column indices (-1 = none). */
  group: number;
  start: number;
  end: number;
  status: number;
}

export interface DateOptions {
  roles: DateRoles;
  /** Start date for every subject when there is no start column. */
  startDate?: string;
  order: DateOrder;
  unit: Exclude<TimeUnit, "">;
  eventWord?: string;
}

const ROLE_RES: Record<keyof DateRoles, RegExp> = {
  group: /^(group|treatment|treat|arm|cohort|condition|genotype|strain|drug|dose)\b/i,
  start: /(start|enrol|enroll|entry|inocul|implant|random|birth|diagnos|baseline|day ?0|begin|first)/i,
  end: /(end|death date|date of death|event date|last|censor.*date|stop|exit|follow|died on|sacrific|date)/i,
  status: /(status|event|dead|died|death|outcome|censor|alive|state)/i,
};

/** Columns guessed from the header names (the user can change them). */
export function guessDateRoles(headers: string[]): DateRoles {
  const taken = new Set<number>();
  const find = (key: keyof DateRoles, extra?: (h: string) => boolean) => {
    const i = headers.findIndex((h, k) => !taken.has(k) && ROLE_RES[key].test(h) && (!extra || extra(h)));
    if (i >= 0) taken.add(i);
    return i;
  };
  const start = find("start");
  // a "date" column that is not the start one is the end; status words
  // that also mention a date ("death date") are dates, not codes
  const end = find("end");
  const status = find("status", (h) => !/date/i.test(h));
  const group = find("group");
  return { group, start, end, status };
}

/** Dates -> one row per subject (see the file comment). The first row
 *  holds the column titles. */
export function datesToSubjects(m: string[][], o: DateOptions): EntryResult {
  if (m.length < 2) return { error: "Paste a table with a header row and one row per subject." };
  const { roles } = o;
  if (roles.end < 0) return { error: "Choose the column with the date of the event or of last follow-up." };
  if (roles.status < 0) return { error: "Choose the column that says whether the event happened." };
  const defaultStart = o.startDate?.trim() ? parseDate(o.startDate, o.order) : null;
  if (roles.start < 0 && defaultStart === null) {
    return { error: o.startDate?.trim()
      ? `“${o.startDate}” is not a date we can read (2024-03-05, 5/3/2024, 5 Mar 2024).`
      : "Choose the start-date column, or enter one start date for every subject." };
  }
  const eventWord = o.eventWord?.trim() || "death";
  const per = DAYS_PER[o.unit];
  const notes: string[] = [];
  const skipped: string[] = [];
  const order: string[] = [];
  const by = new Map<string, Subject[]>();
  for (let i = 1; i < m.length; i++) {
    const r = m[i];
    const line = i + 1;
    const group = roles.group >= 0 ? (r[roles.group] ?? "").trim() || "(no group)" : "All subjects";
    const startRaw = roles.start >= 0 ? (r[roles.start] ?? "") : "";
    const start = roles.start >= 0 ? (startRaw.trim() ? parseDate(startRaw, o.order) : defaultStart) : defaultStart;
    const endRaw = r[roles.end] ?? "";
    const end = parseDate(endRaw, o.order);
    const codeRaw = r[roles.status] ?? "";
    const code = parseEventCode(codeRaw);
    if (start === null) { skipped.push(`row ${line}: start date “${startRaw}” not read`); continue; }
    if (end === null) {
      skipped.push(`row ${line}: ${endRaw.trim() ? `end date “${endRaw}” not read` : "no end date"}`);
      continue;
    }
    if (code === null) {
      skipped.push(`row ${line}: ${codeRaw.trim() ? `event code “${codeRaw}” not read` : "no event code"}`);
      continue;
    }
    const days = end - start;
    if (days < 0) { skipped.push(`row ${line}: the end date is before the start date`); continue; }
    if (!by.has(group)) { by.set(group, []); order.push(group); }
    by.get(group)!.push({ group, time: days / per, event: code });
  }
  if (!order.length) {
    return { error: `No subject could be read${skipped.length ? ` (${skipped.slice(0, 3).join("; ")})` : ""}.` };
  }
  const groups = order.map((name) => ({ name, subjects: by.get(name)! }));
  notes.push(`Time = end date − start date, in ${o.unit}`
    + (o.unit === "months" ? " (a month = 365.25 / 12 days)" : o.unit === "years" ? " (a year = 365.25 days)" : "")
    + `; event codes 1, yes, true, dead or death mean the ${eventWord} happened, 0, no, false, alive `
    + "or censored mean the subject was censored (still event-free when last seen).");
  if (skipped.length) {
    notes.push(`Left out (${skipped.length}): ${skipped.slice(0, 6).join("; ")}${skipped.length > 6 ? "; …" : ""}.`);
  }
  return { groups, summary: summarise(groups, eventWord), notes };
}

// ------------------------------------------------------------ the table, read back

export interface RowReading {
  row: number;
  /** "event on day 12", "censored on day 30", or why the row is not used. */
  text: string;
  used: boolean;
}

export interface GroupReading {
  name: string;
  events: number;
  censored: number;
  /** Rows with a time but an event code other than 0 or 1. */
  otherCodes: { row: number; code: string }[];
  /** Rows with only one of time and event. */
  incomplete: number;
  rows: RowReading[];
}

/** How the survival analysis reads each row of each group (the first two
 *  subcolumns; 1 = event, 0 = censored), for the per-group line and the
 *  "Read as" list above the table. Excluded cells count as blank. */
export function readTable(t: DataTableModel, eventWord = "event"): GroupReading[] {
  const unit = timeUnitOf(t);
  return t.datasets.map((d, gi) => {
    const ex = new Set(d.excluded ?? []);
    const cell = (r: number, c: number) => (ex.has(`${r}:${c}`) ? "" : (d.rows[r]?.[c] ?? "").trim());
    const out: GroupReading = {
      name: d.name.trim() || `Group ${gi + 1}`, events: 0, censored: 0, otherCodes: [], incomplete: 0, rows: [],
    };
    d.rows.forEach((_, r) => {
      const ts = cell(r, 0);
      const es = cell(r, 1);
      if (!ts && !es) return;
      const time = ts ? cellNumber(ts) : null;
      const ev = es ? Number(es.replace(",", ".")) : NaN;
      if (time === null || !es) {
        out.incomplete++;
        out.rows.push({ row: r + 1, used: false,
          text: time === null && ts ? `time “${ts}” is not a number: left out`
            : !ts ? "no time: left out" : "no event code: left out" });
        return;
      }
      if (ev !== 0 && ev !== 1) {
        out.otherCodes.push({ row: r + 1, code: es });
        out.rows.push({ row: r + 1, used: false, text: `event code “${es}” is not 1 or 0` });
        return;
      }
      if (ev === 1) out.events++;
      else out.censored++;
      out.rows.push({ row: r + 1, used: true, text: readAs(time, ev as 0 | 1, unit, eventWord) });
    });
    return out;
  });
}
