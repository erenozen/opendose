// Journal checklists for one family (data table): each item ticked from
// the project, with its reason, its source and a way to fix it.
import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import Modal from "../components/Modal";
import type { DataSheet } from "../project/types";
import { checklistSummary, evaluateChecklists, type ChecklistItem, type FixTarget } from "./checklists";
import { familyFacts } from "./facts";
import { openReportingDetails } from "./useReport";
import "./report.css";

const MARK: Record<ChecklistItem["status"], string> = { met: "✓", unmet: "✗", na: "–" };
const WORD: Record<ChecklistItem["status"], string> = { met: "Met", unmet: "Not met", na: "Not applicable" };

export default function ChecklistPanel({ dataId, onClose }: { dataId?: string; onClose: () => void }) {
  const api = useProject();
  const { project, results } = api;
  const datas = project.sheets.filter((s): s is DataSheet => s.kind === "data");
  const [id, setId] = useState(() => dataId && datas.some((d) => d.id === dataId) ? dataId : datas[0]?.id);
  const data = datas.find((d) => d.id === id);
  const lists = useMemo(() => (data ? evaluateChecklists(familyFacts(project, data, results)) : []),
    [project, data, results]);
  const [tab, setTab] = useState("nature");
  const list = lists.find((l) => l.id === tab) ?? lists[0];
  const sum = checklistSummary(lists);

  const fix = (f: FixTarget) => {
    if (!data) return;
    if (f.kind === "details") { onClose(); openReportingDetails(data.id); return; }
    if (f.kind === "analyze") { onClose(); api.select(data.id); return; }
    if (f.sheetId) { onClose(); api.select(f.sheetId); }
  };

  return (
    <Modal title="Journal checklists" onClose={onClose} className="checklist-modal"
      actions={<button type="button" onClick={onClose}>Close</button>}>
      {datas.length > 1 && (
        <label className="field">
          <span>Data table</span>
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {datas.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      {!data ? <p className="hint-block">No data table in this project.</p> : (
        <>
          <p className="checklist-summary" role="status">
            “{data.name}”: {sum.met} met, {sum.unmet} not met, {sum.na} not applicable across
            the five checklists. Items are ticked from the analyses, graphs and reporting
            details of this table; only items a statistics tool can check are listed.
          </p>
          <div className="checklist-tabs" role="tablist" aria-label="Checklist">
            {lists.map((l) => (
              <button key={l.id} type="button" role="tab" aria-selected={l.id === list?.id}
                onClick={() => setTab(l.id)}>
                {l.title.split(":")[0]} ({l.items.filter((i) => i.status === "met").length}/{l.items.filter((i) => i.status !== "na").length})
              </button>
            ))}
          </div>
          {list && (
            <section role="tabpanel" aria-label={list.title}>
              <h3>{list.title}</h3>
              <p className="hint-block">Source: {list.source}.</p>
              <ul className="checklist">
                {list.items.map((it) => (
                  <li key={it.id} className={it.status} data-status={it.status}>
                    <span className="ck-mark" aria-label={WORD[it.status]} title={WORD[it.status]}>{MARK[it.status]}</span>
                    <span className="ck-text">{it.text}</span>
                    <span className="ck-reason">{it.reason}</span>
                    <span className="ck-source">{it.source}</span>
                    {it.status === "unmet" && it.fix && (
                      <button type="button" className="linkish ck-fix" onClick={() => fix(it.fix!)}>
                        {it.fix.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Modal>
  );
}
