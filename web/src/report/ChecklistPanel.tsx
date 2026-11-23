// Journal checklists for one family (data table): each item ticked from
// the project, with its reason, its source and a way to fix it.
import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import Modal from "../components/Modal";
import { newId } from "../project/ids";
import { startDesign } from "../project/studyDesign";
import type { DataSheet } from "../project/types";
import { checklistSummary, evaluateChecklists, type ChecklistItem, type FixTarget } from "./checklists";
import { familyFacts } from "./facts";
import { openReportingDetails } from "./useReport";
import { exportBundle } from "../share/events";
import "./report.css";
import { Button, Tabs } from "../components/ui";

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
    if (f.kind === "bundle") { onClose(); exportBundle(); return; }
    if (f.kind === "design" && !f.sheetId) {
      let goTo = "";
      api.apply((p) => {
        const r = startDesign(p, data.id, newId);
        goTo = r.sheetId;
        return r.project;
      });
      onClose();
      if (goTo) api.select(goTo);
      return;
    }
    if (f.sheetId) { onClose(); api.select(f.sheetId); }
  };

  return (
    <Modal title="Journal checklists" onClose={onClose} className="checklist-modal"
      actions={<Button onClick={onClose}>Close</Button>}>
      {datas.length > 1 && (
        <label className="field">
          <span>Data table</span>
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {datas.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      {!data ? <p className="hint-block">No data table to check yet. The checklists are ticked from a data table and its analyses: add one with New data table… in the File menu.</p> : (
        <>
          <p className="checklist-summary" role="status">
            “{data.name}”: {sum.met} met, {sum.unmet} not met, {sum.na} not applicable across
            the five checklists. Items are ticked from the analyses, graphs and reporting
            details of this table; only items a statistics tool can check are listed.
          </p>
          <Tabs value={list?.id ?? ""} onValueChange={setTab}>
          <Tabs.List className="checklist-tabs" aria-label="Checklist">
            {lists.map((l) => (
              <Tabs.Tab key={l.id} value={l.id}>
                {l.title.split(":")[0]} ({l.items.filter((i) => i.status === "met").length}/{l.items.filter((i) => i.status !== "na").length})
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {list && (
            <Tabs.Panel value={list.id}>
              <h3>{list.title}</h3>
              <p className="hint-block">Source: {list.source}.</p>
              <ul className="checklist">
                {list.items.map((it) => (
                  <li key={it.id} className={it.status} data-status={it.status}>
                    <span className="ck-mark" aria-hidden="true">{MARK[it.status]}</span>
                    <span className="sr-only">{WORD[it.status]}: </span>
                    <span className="ck-text">{it.text}</span>
                    <span className="ck-reason">{it.reason}</span>
                    <span className="ck-source">{it.source}</span>
                    {it.status === "unmet" && it.fix && (
                      <button type="button" data-still className="linkish ck-fix" onClick={() => fix(it.fix!)}>
                        {it.fix.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Tabs.Panel>
          )}
          </Tabs>
        </>
      )}
    </Modal>
  );
}
