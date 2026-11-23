// Data-entry prompts above a table (guide/entry.ts): numeric row titles in
// a Grouped table, hundreds of rows in a Column table, a normalised
// control. Dismissable per sheet for the session. Each is a condition of
// the table, so each is a Banner at the top of its pane.
import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import { addFamily } from "../app/factory";
import { Banner, Button } from "../components/ui";
import { newId } from "../project/ids";
import type { DataSheet } from "../project/types";
import { entryHints, groupedToXY } from "./entry";
import LearnMore from "./LearnMore";

const dismissed = new Set<string>();

export default function EntryGuide({ data }: { data: DataSheet }) {
  const { apply, select } = useProject();
  const [, force] = useState(0);
  const hints = useMemo(() => entryHints(data.table), [data.table]);
  const gone = (id: string) => dismissed.has(`${data.id}:${id}`);
  if (!hints.length || data.frozen) return null;
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
      {/* Dismissed banners stay mounted with open=false, so they play their exit. */}
      {hints.map((h) => (
        <Banner key={h.id} tone="info" className="entry-hint" data-hint={h.id} open={!gone(h.id)}
          onDismiss={() => dismiss(h.id)} dismissLabel={`Dismiss: ${h.title}`}>
          <Banner.Title>{h.title}</Banner.Title>
          <Banner.Detail>
            {h.body}{h.explainer && <> <LearnMore id={h.explainer} /></>}
          </Banner.Detail>
          {h.action === "xy-copy" && !data.derived && (
            <Banner.Actions>
              <Button size="sm" variant="primary" onClick={xyCopy}>Make an XY copy of this table</Button>
            </Banner.Actions>
          )}
        </Banner>
      ))}
    </div>
  );
}
