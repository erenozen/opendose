// File › Add from project… (P-74) and several project files dropped on the
// page: each file's sheets are added to the open project as they were
// saved (project/merge.ts), in one undo step per file. Where the two
// projects disagree (an info constant, a preference, a pinned colour) a
// dialog lists the differences first: the open project's values are kept,
// and the user adds or cancels.
import { useEffect, useRef, useState } from "react";
import { onAddProjectFiles } from "../app/addProject";
import { openLabKitImport } from "../app/labKit";
import { isLabKitText } from "../project/labKit";
import { useProject } from "../app/context";
import { isExampleProject } from "../guide/firstRun";
import { newId } from "../project/ids";
import { mergeProjects, type MergeConflict, type MergeResult } from "../project/merge";
import { makeProject } from "../project/ops";
import { parseProjectFile } from "../project/persist";
import type { Project, ResultsSheet } from "../project/types";
import Modal from "./Modal";
import { Button, notify } from "./ui";
import "./addProject.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const reason = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/\.$/, "");

/** The open project the sheets go into: the first-run example gives way,
 *  as it does to a Prism file's tables. */
const into = (p: Project) => (isExampleProject(p) ? makeProject(p.prefs, [], p.title) : p);

interface Ask { file: string; plan: MergeResult; answer: (add: boolean) => void }

export default function AddFromProjectHost() {
  const { store, apply, select, results, undo } = useProject();
  const [ask, setAsk] = useState<Ask | null>(null);
  const busy = useRef(Promise.resolve());

  const pick = useRef<() => void>(() => {});
  pick.current = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      if (files.length) queue(files);
    }, { once: true });
    input.click();
  };

  const addOne = async (file: File) => {
    let incoming: Project;
    try {
      const text = await file.text();
      if (isLabKitText(text)) { openLabKitImport(file); return; }
      incoming = parseProjectFile(text, { prefs: store.project.prefs, ids: newId });
    } catch (e) {
      notify(`Could not add “${file.name}”: ${reason(e)}.`, {
        tone: "error", action: { label: "Choose another file", onAction: () => pick.current() },
      });
      return;
    }
    const plan = mergeProjects(into(store.project), incoming, newId);
    if (!plan.sheets) {
      notify(`“${file.name}” has no sheets to add.`, { tone: "info" });
      return;
    }
    if (plan.conflicts.length) {
      const add = await new Promise<boolean>((answer) => setAsk({ file: file.name, plan, answer }));
      setAsk(null);
      if (!add) return;
    }
    let done: MergeResult | null = null;
    // Merged again onto the project as it is now (an edit may have
    // happened while the dialog was open); one undo step.
    apply((p) => {
      done = mergeProjects(into(p), incoming, newId);
      return done.project;
    });
    const r = done as MergeResult | null;
    if (!r) return; // a read-only shared project refused it (apply said so)
    const added = new Set(r.idMap.values());
    // Results saved in the file show at once, until the engine recomputes.
    results.prime(r.project.sheets.filter((s): s is ResultsSheet => s.kind === "results" && added.has(s.id)));
    const first = r.firstDataId ?? r.project.sheets.find((s) => added.has(s.id))?.id ?? null;
    if (first) select(first);
    const what = r.families
      ? `${plural(r.families, "data table")} with ${plural(r.sheets - r.families, "more sheet")}`
      : plural(r.sheets, "sheet");
    notify(`Added ${what} from “${file.name}”.`, {
      tone: "success", action: { label: "Undo", onAction: undo },
    });
  };

  // One file at a time, in the order given (a dialog may wait on each).
  const queue = (files: File[]) => {
    for (const f of files) {
      busy.current = busy.current.then(() => addOne(f)).catch((e: unknown) => {
        notify(`Could not add “${f.name}”: ${reason(e)}.`, { tone: "error" });
      });
    }
  };
  const queueRef = useRef(queue);
  queueRef.current = queue;

  useEffect(() => onAddProjectFiles((files) => {
    if (files?.length) queueRef.current(files);
    else pick.current();
  }), []);

  if (!ask) return null;
  return <ConflictsDialog file={ask.file} plan={ask.plan} onAnswer={ask.answer} />;
}

function ConflictsDialog({ file, plan, onAnswer }: {
  file: string;
  plan: MergeResult;
  onAnswer: (add: boolean) => void;
}) {
  const of = (k: MergeConflict["kind"]) => plan.conflicts.filter((c) => c.kind === k);
  const constants = of("constant");
  const prefs = of("preference");
  const colors = of("color");
  return (
    <Modal title={`Add “${file}” to this project?`} className="modal-wide add-project"
      onClose={() => onAnswer(false)} onSubmit={() => onAnswer(true)}
      actions={(
        <>
          <Button onClick={() => onAnswer(false)}>Cancel</Button>
          <Button type="submit" variant="primary">{`Add ${plural(plan.sheets, "sheet")}`}</Button>
        </>
      )}>
      <p className="modal-text">
        The file differs from this project in {plural(plan.conflicts.length, "setting")}.
        This project keeps its own values; nothing in it is overwritten. Its {plural(plan.sheets, "sheet")} come
        in as they were saved.
      </p>
      {constants.length > 0 && (
        <section aria-labelledby="add-project-constants">
          <h3 id="add-project-constants" className="add-project-heading">Info constants</h3>
          <p className="add-project-note">
            An analysis reads an info constant by its name anywhere in the project, so after
            adding, the analyses of both use the value in the last column.
          </p>
          <div className="add-project-wrap">
            <table className="results-table add-project-table">
              <thead>
                <tr>
                  <th scope="col">Constant</th><th scope="col">This project</th>
                  <th scope="col">In “{file}”</th><th scope="col">Used after adding</th>
                </tr>
              </thead>
              <tbody>
                {constants.map((c) => (
                  <tr key={c.label}>
                    <th scope="row">{c.label}</th><td>{c.here}</td><td>{c.there}</td><td>{c.used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {[...prefs, ...colors].length > 0 && (
        <section aria-labelledby="add-project-prefs">
          <h3 id="add-project-prefs" className="add-project-heading">Preferences and group colours</h3>
          <p className="add-project-note">
            A project has one set: this project&apos;s stays, so the added results are shown with it.
          </p>
          <div className="add-project-wrap">
            <table className="results-table add-project-table">
              <thead>
                <tr>
                  <th scope="col">Setting</th><th scope="col">This project (kept)</th>
                  <th scope="col">In “{file}”</th>
                </tr>
              </thead>
              <tbody>
                {[...prefs, ...colors].map((c) => (
                  <tr key={`${c.kind}:${c.label}`}>
                    <th scope="row">{c.kind === "color" ? `Colour of “${c.label}”` : c.label}</th>
                    <td>{c.here}</td><td>{c.there}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Modal>
  );
}
