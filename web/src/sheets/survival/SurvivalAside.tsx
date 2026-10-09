// Above a survival table: "Survival data from…" (counts per day or
// dates, entryDialog.tsx), the time unit, one line per group saying how
// its rows are read ("Control: 8 events, 2 censored") with warning chips
// (no events, event codes other than 0/1, incomplete rows), a "Read as"
// list of every row on request, and the covariate columns for Cox
// regression (CovariateAside).
import { lazy, Suspense, useMemo, useState } from "react";
import type { AsideProps } from "../types";
import CovariateAside from "./CovariateAside";
import { readTable, timeUnitOf, TIME_UNITS, type TimeUnit } from "./entry";
import "./survival.css";

const SurvivalEntryDialog = lazy(() => import("./entryDialog"));

export default function SurvivalAside(props: AsideProps) {
  const { table, readOnly, onChange } = props;
  const [open, setOpen] = useState(false);
  const [showRows, setShowRows] = useState(false);
  const readings = useMemo(() => readTable(table), [table]);
  const unit = timeUnitOf(table);
  const used = readings.filter((g) => g.rows.length > 0);
  return (
    <div className="surv-aside">
      <div className="surv-aside-row" role="group" aria-label="Survival data entry">
        <button type="button" className="surv-entry-btn" disabled={readOnly} onClick={() => setOpen(true)}
          title="Fill the table from alive (or dead) counts per day, or from start and end dates">
          Survival data from…
        </button>
        <label className="surv-aside-row">
          <span className="surv-aside-label">Time unit</span>
          <select aria-label="Time unit of the table" value={unit} disabled={readOnly}
            onChange={(e) => {
              const xUnit = e.target.value as TimeUnit;
              onChange((t) => ({ ...t, xUnit }));
            }}>
            {TIME_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
        {used.length > 0 && (
          <label className="surv-aside-row">
            <input type="checkbox" checked={showRows} onChange={(e) => setShowRows(e.target.checked)} />
            <span>Show how each row is read</span>
          </label>
        )}
      </div>
      {used.length > 0 && (
        <div className="surv-aside-row" role="list" aria-label="How each group is read">
          {used.map((g) => (
            <span key={g.name} role="listitem" className="surv-aside-row">
              <span className="surv-group-line">
                {g.name}: {g.events} event{g.events === 1 ? "" : "s"}, {g.censored} censored
              </span>
              {g.events === 0 && g.censored > 0 && (
                <span className="surv-chip-warn" title="With no events the curve stays at 100%: no median, and the log-rank test has little to compare.">
                  no events in {g.name}
                </span>
              )}
              {g.otherCodes.length > 0 && (
                <span className="surv-chip-warn" title="Event codes must be 1 (event) or 0 (censored); these rows are left out of the analysis.">
                  event code{g.otherCodes.length === 1 ? "" : "s"}{" "}
                  {[...new Set(g.otherCodes.map((c) => `“${c.code}”`))].join(", ")} (row
                  {g.otherCodes.length === 1 ? "" : "s"} {g.otherCodes.map((c) => c.row).join(", ")}): use 1 = event, 0 = censored
                </span>
              )}
              {g.incomplete > 0 && (
                <span className="surv-chip-warn" title="Each subject needs a time and an event code.">
                  {g.incomplete} incomplete row{g.incomplete === 1 ? "" : "s"} left out
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      {showRows && used.length > 0 && (
        <div className="surv-readas" tabIndex={0} aria-label="Read as: every row">
          {used.map((g) => (
            <div key={g.name}>
              <h5>{g.name}</h5>
              <ol>
                {g.rows.map((r) => (
                  <li key={r.row} className={r.used ? undefined : "unused"}>
                    <span className="surv-row-no">row {r.row}</span> {r.text}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      <CovariateAside {...props} />
      {open && (
        <Suspense fallback={null}>
          <SurvivalEntryDialog table={table} onClose={() => setOpen(false)}
            onApply={(t) => onChange(() => t)} />
        </Suspense>
      )}
    </div>
  );
}
