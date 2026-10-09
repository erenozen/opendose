// Start screen: picture cards for the eight table types (sketch of the
// table and its typical graph, the analyses it allows, an empty table or
// the example), "paste data and suggest a table type", the example
// project with its guided tour, and opening a project or Prism file (also
// by dropping it anywhere on the screen), or converting Prism files to CSV.
import { useId, useMemo, useState, type DragEvent } from "react";
import { useProject } from "../app/context";
import { Logo } from "../components/WelcomePanel";
import { newId } from "../project/ids";
import type { TableType } from "../project/types";
import { TABLE_ORDER, tableDef } from "../sheets/registry";
import { guidedExampleProject, singleTableProject } from "./actions";
import { setStartScreenEnabled, startScreenEnabled, tourDone } from "./context";
import { buildTable, parsePasted, suggestTableType } from "./paste";
import { CARD_TEXT, SKETCHES } from "./sketches";
import { usePrismBatch } from "../share/usePrismBatch";
import { takeTableDrop } from "../share/recipes/readFiles";
import "./startPrism.css";

/** Files the Open button takes: OpenDose projects and Prism files. */
const OPENABLE = /\.(json|pzfx|prism|zip)$/i;

export default function StartScreen({ onOpenFile, onClose, onTour }: {
  onOpenFile: (f: File) => void;
  onClose: () => void;
  onTour: () => void;
}) {
  const { replace, store, status, engineReady, engineError } = useProject();
  const prefs = store.project.prefs;
  const [text, setText] = useState("");
  const [override, setOverride] = useState<TableType | null>(null);
  const [remember, setRemember] = useState(startScreenEnabled);
  const pasteId = useId();
  const block = useMemo(() => parsePasted(text), [text]);
  const guess = useMemo(() => suggestTableType(block), [block]);
  const type = override ?? guess.type;
  const batch = usePrismBatch();
  // Drag a project or Prism file anywhere onto the screen to open it.
  const [dropping, setDropping] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDropping(false);
    const files = [...e.dataTransfer.files];
    if (takeTableDrop(files, onOpenFile, onClose)) return; // several CSVs or a zip: import with a recipe
    const f = files.find((x) => OPENABLE.test(x.name));
    if (!f) {
      setDropNote("That is not a file OpenDose opens here: drop a .prism, .pzfx or OpenDose "
        + "project (.json) file, or paste the cells of a spreadsheet below.");
      return;
    }
    onOpenFile(f);
    onClose();
  };

  const begin = (r: { project: Parameters<typeof replace>[0]; dataId: string }) => {
    replace(r.project, r.dataId);
    onClose();
  };
  const example = () => {
    begin(guidedExampleProject(prefs, newId));
    if (!tourDone()) onTour();
  };
  const fromPaste = () => {
    if (!block) return;
    begin(singleTableProject(prefs, newId, type, { table: buildTable(block, type), name: "Pasted data" }));
  };

  return (
    <main className={`start-screen${dropping ? " start-dropping" : ""}`} aria-labelledby="start-title"
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={onDrop}>
      <div className="start-inner">
        <div className="start-hero">
          <Logo />
          <div>
            <h2 id="start-title">Start with your data</h2>
            <p className="start-lede">Pick the table that matches the shape of your data, paste a
              block and let OpenDose suggest one, or explore the example project.</p>
          </div>
        </div>

        <div className="start-top">
          <section className="start-example" aria-labelledby="start-example-h">
            <h3 id="start-example-h">New here?</h3>
            <p>The example project has a dose-response curve, a three-group comparison,
              a contingency table and survival curves, all linked to their results and
              graphs. A five-step tour shows the essentials.</p>
            <div className="start-row">
              <button type="button" className="btn-primary" onClick={example}>
                Open the example project</button>
              <label className="load-btn start-open">
                Open a project or Prism file…
                <input type="file" accept=".json,.pzfx,.prism,.zip" hidden
                  aria-label="Open a project or Prism file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { onOpenFile(f); onClose(); }
                    e.target.value = "";
                  }} />
              </label>
            </div>
          </section>

          <section className="start-paste" aria-labelledby="start-paste-h">
            <h3 id="start-paste-h"><label htmlFor={pasteId}>Paste data and get a table type</label></h3>
            <textarea id={pasteId} value={text} rows={5} spellCheck={false}
              placeholder={"Paste cells copied from a spreadsheet, e.g.\nConc\tRep 1\tRep 2\n0.01\t98\t101\n0.1\t71\t66"}
              onChange={(e) => { setText(e.target.value); setOverride(null); }} />
            {block && (
              <div className="start-suggest" role="status">
                <p><strong>Suggested: {tableDef(guess.type).label} table.</strong> {guess.reason}</p>
                <div className="start-row">
                  <label className="start-type">
                    <span>Create as</span>
                    <select value={type} aria-label="Table type for the pasted data"
                      onChange={(e) => setOverride(e.target.value as TableType)}>
                      {TABLE_ORDER.map((t) => <option key={t} value={t}>{tableDef(t).label}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn-primary" onClick={fromPaste}>
                    Create {tableDef(type).label} table</button>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="start-prism" aria-labelledby="start-prism-h">
          <h3 id="start-prism-h">GraphPad Prism files (.prism, .pzfx)</h3>
          <p>
            Open a .prism or .pzfx file: every data table is imported; analyses are
            recomputed here. Drop the file anywhere on this screen, or use{" "}
            <em>Open a project or Prism file…</em> above.
          </p>
          <p>
            Several files?{" "}
            <button type="button" className="linkish" disabled={batch.busy} onClick={batch.pick}>
              Convert Prism files to CSV…</button>{" "}
            saves every data table of each file as a CSV, in one zip.
          </p>
          {batch.input}
          {dropNote && <p className="start-drop-note" role="alert">{dropNote}</p>}
        </section>

        <section aria-labelledby="start-types-h">
          <h3 id="start-types-h" className="start-section">Or choose a table type</h3>
          <ul className="start-cards">
            {TABLE_ORDER.map((t) => {
              const def = tableDef(t);
              const sk = SKETCHES[t];
              return (
                <li key={t} className="start-card" data-type={t}>
                  <h4>{def.label}</h4>
                  <div className="start-sketch">{sk.table}{sk.graph}</div>
                  <p className="start-what">{CARD_TEXT[t].what}</p>
                  <p className="start-analyses">{CARD_TEXT[t].analyses}</p>
                  <div className="start-card-actions">
                    <button type="button" onClick={() => begin(singleTableProject(prefs, newId, t))}
                      aria-label={`New empty ${def.label} table`}>Empty table</button>
                    {def.sampleTable && (
                      <button type="button"
                        onClick={() => begin(singleTableProject(prefs, newId, t, { example: true }))}
                        aria-label={`${def.label} example`}>Example</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="start-foot">
          <label className="check-row"
            title="Unticked, this screen shows on the first visit and whenever there is no last session to reopen">
            <input type="checkbox" checked={remember}
              onChange={(e) => { setRemember(e.target.checked); setStartScreenEnabled(e.target.checked); }} />
            <span>Show this screen when OpenDose opens</span>
          </label>
          <span className="start-status" role="status">
            {engineError ? `Analysis engine failed to load: ${engineError}`
              : engineReady ? "Analysis engine ready." : status || "Loading the analysis engine…"}
          </span>
          <button type="button" className="start-skip" onClick={onClose}>
            Skip to the workbench</button>
        </div>
      </div>
    </main>
  );
}
