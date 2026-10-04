// Data-entry prompts above a table (guide/entry.ts): numeric row titles in
// a Grouped table, hundreds of rows in a Column table, a normalised
// control. Dismissable per sheet for the session.
import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import { addFamily } from "../app/factory";
import { newId } from "../project/ids";
import type { DataSheet } from "../project/types";
import { entryHints, groupedToXY } from "./entry";
import LearnMore from "./LearnMore";

const dismissed = new Set<string>();

export default function EntryGuide({ data }: { data: DataSheet }) {
  const { apply, select } = useProject();
  const [, force] = useState(0);
  const hints = useMemo(() => entryHints(data.table), [data.table]);
  const shown = hints.filter((h) => !dismissed.has(`${data.id}:${h.id}`));
  if (!shown.length || data.frozen) return null;
  const dismiss = (id: string) => { dismissed.add(`${data.id}:${id}`); force((x) => x + 1); };
  const xyCopy = () => {
    let id = "";
    apply((p) => {
      const r = addFamily(p, groupedToXY(data.table), `${data.name} (XY)`, newId);
      id = r.dataId;
      return r.project;
    });
    if (id) select(id);
  };
  return (
    <div className="entry-guide">
      {shown.map((h) => (
        <div key={h.id} className="guide-banner banner-info entry-hint" role="note"
          data-hint={h.id}>
          <p className="guide-banner-title">{h.title}</p>
          <p>{h.body}</p>
          <p className="guide-banner-foot">
            {h.action === "xy-copy" && !data.derived && (
              <button type="button" className="btn-primary" onClick={xyCopy}>
                Make an XY copy of this table</button>
            )}
            {h.explainer && <LearnMore id={h.explainer} />}
            <button type="button" className="dismiss" onClick={() => dismiss(h.id)}>Dismiss</button>
          </p>
        </div>
      ))}
    </div>
  );
}
