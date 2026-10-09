// "Survival data from…": counts per day or dates -> one row per subject
// (survival/entry.ts), with a preview that says how each subject is read
// ("death on day 12", "censored on day 30") before the table is replaced
// (one undo step).
import { useMemo, useState } from "react";
import Modal from "../../components/Modal";
import type { DataTableModel, DateOrder } from "../../project/types";
import { localeDateOrder } from "../../project/xformat";
import {
  countsToSubjects, datesToSubjects, fmtTime, guessDateRoles, parseGrid, readAs, survivalTableFrom,
  TIME_UNITS, type CountKind, type DateRoles, type EntryResult, type TimeUnit,
} from "./entry";
import "../common/grid.css";
import "./survival.css";

type Mode = "counts" | "dates";

const PREVIEW_MAX = 300;

const COUNTS_PLACEHOLDER = "Day\tVehicle\tDrug\n0\t10\t10\n7\t9\t10\n14\t6\t9\n21\t4\t8\n28\t3\t8";
const DATES_PLACEHOLDER = "Mouse\tGroup\tStart\tEnd\tStatus\n1\tVehicle\t2024-03-01\t2024-03-13\tdead\n"
  + "2\tVehicle\t2024-03-01\t2024-03-31\talive\n3\tDrug\t2024-03-01\t2024-03-31\talive";

export default function SurvivalEntryDialog({ table, onApply, onClose, initialMode = "counts" }: {
  table: DataTableModel;
  onApply: (t: DataTableModel) => void;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CountKind>("alive");
  const [startN, setStartN] = useState("");
  const [countUnit, setCountUnit] = useState<TimeUnit>("days");
  const [eventWord, setEventWord] = useState("death");
  const [override, setOverride] = useState<Partial<DateRoles>>({});
  const [startDate, setStartDate] = useState("");
  const [order, setOrder] = useState<DateOrder>(() => localeDateOrder());
  const [dateUnit, setDateUnit] = useState<Exclude<TimeUnit, "">>("days");

  const matrix = useMemo(() => parseGrid(text), [text]);
  const headers = mode === "dates" && matrix.length
    ? matrix[0].map((h, i) => h || `Column ${i + 1}`) : [];
  const roles: DateRoles = { ...guessDateRoles(headers), ...override };

  // Cheap enough to redo on every render (a pasted table of a few hundred rows).
  const fill: EntryResult | null = (() => {
    if (!text.trim()) return null;
    if (mode === "counts") {
      const ns = startN.split(/[\s,;]+/).filter(Boolean).map(Number);
      return countsToSubjects(matrix, {
        kind, eventWord, startN: ns.length && ns.every((n) => Number.isFinite(n)) ? ns : undefined,
      });
    }
    return datesToSubjects(matrix, { roles, startDate, order, unit: dateUnit, eventWord });
  })();

  const unit: TimeUnit = mode === "counts" ? countUnit : dateUnit;
  const ok = fill && !("error" in fill) ? fill : null;
  const subjects = ok ? ok.groups.flatMap((g) => g.subjects) : [];

  const submit = () => {
    if (!ok) return;
    onApply(survivalTableFrom(table, ok.groups, unit));
    onClose();
  };

  const roleSelect = (key: keyof DateRoles, label: string, optional: boolean) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <select aria-label={label} value={roles[key]}
        onChange={(e) => setOverride({ ...override, [key]: Number(e.target.value) })}>
        <option value={-1}>{optional ? "None" : "Choose a column"}</option>
        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
      </select>
    </label>
  );

  return (
    <Modal title="Survival data from counts or dates" className="modal-wide surv-entry-dialog"
      onClose={onClose} onSubmit={submit}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!ok}>Fill the table</button>
        </>
      }>
      <p className="modal-text">
        The survival table holds one row per subject: the time it was followed and whether the
        event happened (1) or the subject was censored (0). Paste what you recorded and check how
        each subject is read before filling the table.
      </p>
      <fieldset className="field-radios">
        <legend>Start from</legend>
        <label><input type="radio" name="surv-entry-mode" checked={mode === "counts"}
          onChange={() => setMode("counts")} /> Counts per day (alive or deaths per group)</label>
        <label><input type="radio" name="surv-entry-mode" checked={mode === "dates"}
          onChange={() => setMode("dates")} /> Dates (start, event or last seen, event yes/no)</label>
      </fieldset>
      {mode === "counts" ? (
        <>
          <p className="field-note">
            First column: the time (day 0, 1, 2…); then one column per group, with the group names
            in the first row. With <strong>alive per day</strong>, the first count is the number at
            the start, each fall in the count is that many deaths at that time, and the subjects
            still alive at the group&apos;s last count are censored then. Subjects removed alive
            (for tissue, or lost) are not deaths: set their event code to 0 after filling.
          </p>
          <div className="field-row">
            <label className="field">
              <span>The counts are</span>
              <select aria-label="The counts are" value={kind}
                onChange={(e) => setKind(e.target.value === "deaths" ? "deaths" : "alive")}>
                <option value="alive">Alive at each time</option>
                <option value="deaths">Deaths at each time</option>
              </select>
            </label>
            {kind === "deaths" && (
              <label className="field">
                <span>Subjects per group at the start</span>
                <input aria-label="Subjects per group at the start" value={startN} inputMode="numeric"
                  placeholder="10 (or 10, 12 per group)" onChange={(e) => setStartN(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span>Time unit</span>
              <select aria-label="Time unit" value={countUnit}
                onChange={(e) => setCountUnit(e.target.value as TimeUnit)}>
                {TIME_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>The event is</span>
              <input aria-label="The event is" value={eventWord} onChange={(e) => setEventWord(e.target.value)} />
            </label>
          </div>
        </>
      ) : (
        <p className="field-note">
          One row per subject, column titles in the first row: a group, the start date (or one
          start date for everyone), the date of the event or of the last follow-up, and whether
          the event happened (1/0, yes/no, dead/alive, death/censored, true/false; 1 = event,
          0 = censored, as in the GraphPad statistics guide&apos;s survival tables).
        </p>
      )}
      <label className="field">
        <span>Pasted table</span>
        <textarea rows={7} value={text} spellCheck={false} aria-label="Pasted table"
          placeholder={mode === "counts" ? COUNTS_PLACEHOLDER : DATES_PLACEHOLDER}
          onChange={(e) => { setText(e.target.value); setOverride({}); }} />
      </label>
      {mode === "dates" && headers.length > 0 && (
        <div className="field-row">
          {roleSelect("group", "Group column", true)}
          {roleSelect("start", "Start date column", true)}
          {roles.start < 0 && (
            <label className="field">
              <span>Start date for everyone</span>
              <input aria-label="Start date for everyone" value={startDate} placeholder="2024-03-01"
                onChange={(e) => setStartDate(e.target.value)} />
            </label>
          )}
          {roleSelect("end", "Event or last-seen date column", false)}
          {roleSelect("status", "Event column (yes/no)", false)}
          <label className="field">
            <span>Dates like 03/04/2024 are</span>
            <select aria-label="Date order" value={order} onChange={(e) => setOrder(e.target.value === "mdy" ? "mdy" : "dmy")}>
              <option value="dmy">day/month/year</option>
              <option value="mdy">month/day/year</option>
            </select>
          </label>
          <label className="field">
            <span>Time in</span>
            <select aria-label="Time in" value={dateUnit}
              onChange={(e) => setDateUnit(e.target.value as Exclude<TimeUnit, "">)}>
              {TIME_UNITS.filter((u) => u.id && u.id !== "hours").map((u) =>
                <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>The event is</span>
            <input aria-label="The event is" value={eventWord} onChange={(e) => setEventWord(e.target.value)} />
          </label>
        </div>
      )}
      {fill && "error" in fill && <p className="field-note long-table-error" role="alert">{fill.error}</p>}
      {ok && (
        <>
          <p className="import-summary" role="status">{ok.summary}</p>
          {ok.notes.map((n) => <p key={n} className="field-note">{n}</p>)}
          <div className="surv-entry-preview" tabIndex={0} aria-label="Preview: how each subject is read">
            <table>
              <thead><tr><th>Group</th><th>Time</th><th>Event</th><th>Read as</th></tr></thead>
              <tbody>
                {subjects.slice(0, PREVIEW_MAX).map((s, i) => (
                  <tr key={i}>
                    <td>{s.group}</td>
                    <td>{fmtTime(s.time)}</td>
                    <td>{s.event}</td>
                    <td className="readas">{readAs(s.time, s.event, unit, eventWord.trim() || "death")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {subjects.length > PREVIEW_MAX && (
              <p className="field-note">… and {subjects.length - PREVIEW_MAX} more subjects.</p>
            )}
          </div>
          <p className="field-note">
            This replaces the values in the table ({ok.groups.length} group
            {ok.groups.length === 1 ? "" : "s"}, one row per subject); Undo restores them.
            {table.datasets.some((d) => (d.subTitles?.length ?? 0) > 2) ? " Covariate columns are removed." : ""}
          </p>
        </>
      )}
    </Modal>
  );
}
