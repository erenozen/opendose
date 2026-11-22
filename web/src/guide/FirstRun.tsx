// First run in the workspace (DECISIONS 4; state and rules in
// firstRun.ts, the paste itself in usePasteAnywhere.ts): the "Example
// data" banner with the one instruction line and the example chips, and
// the paste banner (the guessed type, its reason, "Read as", the
// error-value note, the primary verb and Undo). Both sit at the top of
// the data pane; one of them at a time.
import { useEffect, useId, useRef, useState } from "react";
import { useProject } from "../app/context";
import type { DataSheet, TableType } from "../project/types";
import { TABLE_ORDER, tableDef } from "../sheets/registry";
import { Banner, Button } from "../components/ui";
import {
  isExampleProject, PRIMARY_VERB, setPasteNote, tableNoun, type PasteNote,
} from "./firstRun";
import { useFirstRun, usePasteActions } from "./usePasteAnywhere";
import "./firstRun.css";

/** The instruction line of the example (DECISIONS 4): the one line that
 *  replaced the start screen's hero. */
const PASTE_LINE = "Paste a block from Excel anywhere on this page. Doses in the first "
  + "column, responses next to it; a header row is fine.";

/** The top of the data pane on first run: the example's banner, or the
 *  banner of the paste that made this table. */
export function FirstRunBanner({ data }: { data: DataSheet }) {
  const { project } = useProject();
  const fr = useFirstRun();
  if (fr.paste?.dataId === data.id) return <PasteBanner note={fr.paste} />;
  if (fr.exampleIds.has(data.id) && isExampleProject(project, fr.exampleIds)) {
    return <ExampleBanner data={data} ids={fr.exampleIds} />;
  }
  return null;
}

const CHIP_LABEL: Partial<Record<TableType, string>> = {
  xy: "Dose-response", contingency: "Contingency", survival: "Survival",
};

/** "Example data", the instruction line, and chips for the example's
 *  tables (dose-response, contingency, survival). */
function ExampleBanner({ data, ids }: { data: DataSheet; ids: ReadonlySet<string> }) {
  const { project, select } = useProject();
  const tables = project.sheets.filter((s): s is DataSheet => s.kind === "data" && ids.has(s.id));
  return (
    <Banner className="first-banner example-banner" icon={null}>
      <Banner.Title>Example data</Banner.Title>
      <Banner.Detail>{PASTE_LINE}</Banner.Detail>
      {tables.length > 1 && (
        <Banner.Actions role="group" aria-label="Examples" className="example-chips">
          {tables.map((t) => (
            <Button key={t.id} size="sm" aria-pressed={t.id === data.id}
              onClick={() => select(t.id)}>
              {CHIP_LABEL[t.table.type] ?? t.name}
            </Button>
          ))}
        </Banner.Actions>
      )}
    </Banner>
  );
}

/** What the paste was read as and why, the error-value note, "Read as",
 *  the type's verb (confirms, or reads the text again as the chosen
 *  type) and Undo. */
function PasteBanner({ note }: { note: PasteNote }) {
  const { paste, revert } = usePasteActions();
  const selectId = useId();
  const current = note.read.type;
  const [as, setAs] = useState<TableType>(current);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (note.refocus) selectRef.current?.focus(); }, [note]);
  const guessed = note.read.suggestion.type === current;
  const label = tableDef(current).label;
  const n = note.read.block.rows.length;
  const done = () => {
    setPasteNote(null);
    document.getElementById("sheet")?.focus();
  };
  return (
    <Banner tone="info" className="first-banner paste-banner" announce>
      <Banner.Title>
        {n} row{n === 1 ? "" : "s"} pasted, read as {tableNoun(label)}.
      </Banner.Title>
      <Banner.Detail>
        <p>{guessed ? note.read.suggestion.reason
          : `You chose ${label}. The guess was ${tableDef(note.read.suggestion.type).label}: `
            + note.read.suggestion.reason}</p>
        {note.read.errorNote && <p className="paste-error-note">{note.read.errorNote}</p>}
        {/* A choice, applied by the verb button: a select that rebuilt the
            table on change would do it on every arrow key. */}
        <span className="paste-read-as">
          <label htmlFor={selectId}>Read as</label>
          <select id={selectId} ref={selectRef} value={as}
            onChange={(e) => setAs(e.target.value as TableType)}>
            {TABLE_ORDER.map((t) => <option key={t} value={t}>{tableDef(t).label}</option>)}
          </select>
        </span>
      </Banner.Detail>
      <Banner.Actions>
        <Button variant="primary" onClick={() => {
          if (as === current) done();
          else paste(note.text, as, note);
        }}>{PRIMARY_VERB[as]}</Button>
        <Button aria-label={note.replacedExample ? "Undo, restore the example" : "Undo, remove the pasted table"}
          onClick={() => {
            revert(note);
            document.getElementById("sheet")?.focus();
          }}>Undo</Button>
      </Banner.Actions>
    </Banner>
  );
}
