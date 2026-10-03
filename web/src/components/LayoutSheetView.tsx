import { useProject } from "../app/context";
import { findSheet, updateSheet } from "../project/ops";
import type { LayoutSheet, Sheet } from "../project/types";

/**
 * Layout sheets record which graphs a page will hold and its grid. The
 * page composer (placing, resizing, exporting the whole page) is a later
 * work package; this view lists and picks the graphs.
 */
export default function LayoutSheetView({ sheet }: { sheet: LayoutSheet }) {
  const { project, apply } = useProject();
  const graphs = project.sheets.filter((s) => s.kind === "graph");
  const edit = (fn: (s: LayoutSheet) => LayoutSheet) =>
    apply((p) => updateSheet<Sheet>(p, sheet.id, (s) =>
      (s.kind === "layout" && !s.frozen ? fn(s) : s)));
  const toggle = (id: string, on: boolean) => edit((s) => ({
    ...s,
    graphIds: on ? [...s.graphIds, id] : s.graphIds.filter((g) => g !== id),
  }));
  return (
    <main className="info-main">
      <section className="result-card layout-card">
        <h3>{sheet.name}</h3>
        <p className="hint-block">
          <span className="soon-badge">Coming next release</span>{" "}
          Page layouts (several graphs arranged on one page and exported
          together) are on the way. Pick the graphs this layout will hold;
          the choice is saved with the project.
        </p>
        <div className="layout-grid-fields">
          {(["rows", "cols"] as const).map((k) => (
            <label key={k} className="field field-num">
              <span>{k === "rows" ? "Rows" : "Columns"}</span>
              <input inputMode="numeric" value={sheet.grid[k]}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (n >= 1 && n <= 6) edit((s) => ({ ...s, grid: { ...s.grid, [k]: n } }));
                }} />
            </label>
          ))}
        </div>
        {graphs.length ? (
          <ul className="layout-graphs">
            {graphs.map((g) => {
              const parent = g.kind === "graph" ? findSheet(project, g.parentId) : undefined;
              return (
                <li key={g.id}>
                  <label className="check-row">
                    <input type="checkbox" checked={sheet.graphIds.includes(g.id)}
                      onChange={(e) => toggle(g.id, e.target.checked)} />
                    <span>{g.name}</span>
                    {parent && <span className="nav-sub">· {parent.name}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : <p className="hint-block">The project has no graphs yet.</p>}
      </section>
    </main>
  );
}
