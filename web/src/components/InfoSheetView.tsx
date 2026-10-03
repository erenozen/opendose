import { useProject } from "../app/context";
import { updateSheet } from "../project/ops";
import type { InfoConstant, InfoSheet, Sheet } from "../project/types";

/**
 * Info sheet: a table of named constants on the left (experiment date,
 * notebook reference, concentrations used...) and free-text notes on the
 * right. A user-formula Transform can hook a constant by name and follows
 * its value (project/infoLinks.ts).
 */
export default function InfoSheetView({ sheet }: { sheet: InfoSheet }) {
  const { project, apply } = useProject();
  const ro = !!sheet.frozen;
  const edit = (fn: (s: InfoSheet) => InfoSheet, key: string | null = null) =>
    apply((p) => updateSheet<Sheet>(p, sheet.id, (s) =>
      (s.kind === "info" && !s.frozen ? fn(s) : s)), key);
  const setConstants = (constants: InfoConstant[], key: string | null = null) =>
    edit((s) => ({ ...s, constants }), key);
  const c = sheet.constants;
  const dataSheets = project.sheets.filter((s) => s.kind === "data");

  return (
    <main className="info-main">
      <div className="info-grid">
        <section className="result-card info-constants" aria-labelledby="info-constants-h">
          <h3 id="info-constants-h">Constants</h3>
          <p className="hint-block">
            Name each value you may want to refer to later (dates, IDs,
            concentrations used).
          </p>
          <table className="info-table">
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Value</th><th aria-hidden="true" /></tr>
            </thead>
            <tbody>
              {c.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input value={row.name} readOnly={ro} aria-label={`Constant ${i + 1} name`}
                      onChange={(e) => setConstants(c.map((x, j) => (j === i
                        ? { ...x, name: e.target.value } : x)), `info:${sheet.id}:n${i}`)} />
                  </td>
                  <td>
                    <input value={row.value} readOnly={ro} aria-label={`${row.name || `Constant ${i + 1}`} value`}
                      onChange={(e) => setConstants(c.map((x, j) => (j === i
                        ? { ...x, value: e.target.value } : x)), `info:${sheet.id}:v${i}`)} />
                  </td>
                  <td className="info-row-tools">
                    {!ro && (
                      <>
                        <button type="button" aria-label={`Move ${row.name || "row"} up`}
                          disabled={i === 0}
                          onClick={() => {
                            const next = [...c];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            setConstants(next);
                          }}>↑</button>
                        <button type="button" aria-label={`Move ${row.name || "row"} down`}
                          disabled={i === c.length - 1}
                          onClick={() => {
                            const next = [...c];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            setConstants(next);
                          }}>↓</button>
                        <button type="button" aria-label={`Delete ${row.name || "row"}`}
                          onClick={() => setConstants(c.filter((_, j) => j !== i))}>✕</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ro && (
            <div className="table-actions">
              <button type="button"
                onClick={() => setConstants([...c, { name: "", value: "" }])}>+ Constant</button>
            </div>
          )}
          <label className="field info-link">
            <span>Linked to</span>
            <select value={sheet.parentId ?? ""} disabled={ro}
              onChange={(e) => edit((s) => ({ ...s, parentId: e.target.value || null }))}>
              <option value="">The whole project</option>
              {dataSheets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        </section>
        <section className="result-card info-notes" aria-labelledby="info-notes-h">
          <h3 id="info-notes-h">Notes</h3>
          <textarea value={sheet.notes} readOnly={ro} aria-labelledby="info-notes-h"
            placeholder="Protocol details, observations, anything worth keeping with the data."
            onChange={(e) => edit((s) => ({ ...s, notes: e.target.value }), `info:${sheet.id}:notes`)} />
        </section>
      </div>
    </main>
  );
}
