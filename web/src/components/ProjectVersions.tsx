// Saved versions and recent projects (P-72): File › Save a version… and
// File › Open recent… (the palette finds both). Versions and the autosaved
// sessions of closed tabs stay in this browser (project/versions.ts,
// project/sessions.ts); the storage line says how much room is left.
import { useEffect, useState } from "react";
import { onShellRequest } from "../app/commandRegistry";
import { useProject } from "../app/context";
import { projectResults } from "../app/projectResults";
import { currentSavedWith } from "../app/reproduceCheck";
import type { AutosaveApi } from "../app/useAutosave";
import { useUi } from "../app/ui";
import { isExampleProject } from "../guide/firstRun";
import { otherKv, type SessionRecord } from "../project/autosave";
import { newId } from "../project/ids";
import { parseProjectFile, savedSelection, serializeProject } from "../project/persist";
import { savedWithOf } from "../project/reproduce";
import {
  describeStorage, formatBytes, requestPersistence, storageReport,
} from "../project/sessions";
import {
  cleanNote, deleteVersion, listVersions, MAX_NOTE, noteProblem, quotaProblem, recentProjects,
  saveVersion, versionBytes, type VersionRecord,
} from "../project/versions";
import { prepareReproduceCheckFor } from "../app/reproduceCheck";
import CompareDialog from "./CompareDialog";
import Modal from "./Modal";
import { Button, Field, Input, notify } from "./ui";
import "./versions.css";

const when = (t: number) => new Date(t).toLocaleString();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const storage = () => (typeof navigator !== "undefined" ? navigator.storage : null);

/** The shell's answer to "save-version", "recent" and "compare". */
export default function VersionsHost({ autosave }: { autosave: AutosaveApi }) {
  const [open, setOpen] = useState<"save" | "recent" | "compare" | null>(null);
  // Compare… on a version: that version against the open project (P-73).
  const [compareFrom, setCompareFrom] = useState<VersionRecord | null>(null);
  useEffect(() => onShellRequest((kind) => {
    if (kind === "save-version") setOpen("save");
    else if (kind === "recent") setOpen("recent");
    else if (kind === "compare") { setCompareFrom(null); setOpen("compare"); }
  }), []);
  const close = () => setOpen(null);
  if (open === "save") return <SaveVersionDialog onClose={close} />;
  if (open === "compare") return <CompareDialog initial={compareFrom} onClose={close} />;
  if (open === "recent") {
    return (
      <RecentDialog autosave={autosave} onClose={close}
        onCompare={(v) => { setCompareFrom(v); setOpen("compare"); }} />
    );
  }
  return null;
}

function SaveVersionDialog({ onClose }: { onClose: () => void }) {
  const { store, results, selectedId } = useProject();
  const [note, setNote] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const problem = noteProblem(note);

  const submit = async () => {
    setAttempts((n) => n + 1);
    if (problem || busy) return;
    setBusy(true);
    try {
      const p = store.project;
      // Every result current for its input, so the version keeps its numbers.
      const r = await projectResults(p, results);
      const json = serializeProject(p, r.results,
        { keys: r.keys, selected: selectedId, savedWith: currentSavedWith() });
      const rec: VersionRecord = {
        id: newId(), savedAt: Date.now(), title: p.title, note: cleanNote(note),
        sheets: p.sheets.length, json,
      };
      const room = quotaProblem(await storageReport(storage()), versionBytes(json));
      if (room) throw new Error(room);
      if (!await saveVersion(otherKv, rec)) {
        throw new Error("this browser refused to store it (storage blocked or full)");
      }
      void requestPersistence(storage());
      onClose();
      notify(`Saved the version “${rec.note}” of “${rec.title}”.`, { tone: "success" });
    } catch (e) {
      setBusy(false);
      notify(`Could not save the version “${cleanNote(note)}”: `
        + `${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}. `
        + "Save the project as a file instead, or delete older versions in File › Open recent….",
      { tone: "error" });
    }
  };

  return (
    <Modal title="Save a version" onClose={onClose} onSubmit={() => { void submit(); }}
      actions={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">Save version</Button>
        </>
      )}>
      <p className="modal-text">
        Keeps the project as it is now, with its results, in this browser. Restore it or compare
        it later from File › Open recent….
      </p>
      <Field label="Note" description="What this version is, for example “before reviewer”."
        error={problem} submitCount={attempts}>
        <Input value={note} maxLength={MAX_NOTE} autoComplete="off" spellCheck={false}
          onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

function RecentDialog({ autosave, onClose, onCompare }: {
  autosave: AutosaveApi;
  onClose: () => void;
  onCompare?: (v: VersionRecord) => void;
}) {
  const { store, replace } = useProject();
  const ui = useUi();
  const [versions, setVersions] = useState<VersionRecord[] | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listVersions(otherKv).then((v) => { if (live) setVersions(v); }, () => { if (live) setVersions([]); });
    void storageReport(storage()).then((r) => { if (live) setRoom(describeStorage(r)); });
    return () => { live = false; };
  }, []);
  const projects = versions ? recentProjects(autosave.kept, versions) : [];

  const restoreVersion = (v: VersionRecord) => {
    const before = store.project;
    const worth = before.sheets.some((s) => s.kind === "data") && !isExampleProject(before);
    try {
      const p = parseProjectFile(v.json, { prefs: before.prefs, ids: newId });
      replace(prepareReproduceCheckFor(savedWithOf(v.json), p, v.title, "autosave"), savedSelection(v.json));
      onClose();
      notify(`Restored the version “${v.note}” of “${v.title}”.`, {
        tone: "success",
        action: worth ? { label: "Undo", onAction: () => replace(before) } : undefined,
      });
    } catch (e) {
      notify(`Could not restore the version “${v.note}”: `
        + `${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}.`, { tone: "error" });
    }
  };
  const restoreSession = (s: SessionRecord) => {
    onClose();
    void autosave.restore(s.id);
  };
  const remove = async (v: VersionRecord) => {
    const ok = await ui.confirm({
      title: `Delete the version “${v.note}”?`,
      body: `The version of “${v.title}” saved ${when(v.savedAt)} is deleted from this browser and cannot be restored.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await deleteVersion(otherKv, v.id);
    setVersions((list) => (list ?? []).filter((x) => x.id !== v.id));
    notify(`Deleted the version “${v.note}”.`, { tone: "success" });
  };

  return (
    <Modal title="Recent projects" className="modal-wide recent-dialog" onClose={onClose}
      actions={<Button onClick={onClose}>Close</Button>}>
      {versions === null ? (
        <p className="modal-text" role="status">Reading this browser’s storage…</p>
      ) : projects.length === 0 ? (
        <p className="modal-text">
          No saved versions or sessions of closed tabs in this browser yet. File › Save a version…
          keeps the project as it is now.
        </p>
      ) : (
        <div className="recent-list">
          {projects.map((rp) => (
            <section key={rp.title} className="recent-project" aria-label={rp.title}>
              <h3>{rp.title}</h3>
              <ul>
                {rp.sessions.map((s) => {
                  const which = ` the autosaved session of “${s.title}” saved ${when(s.savedAt)}`;
                  return (
                    <li key={`s-${s.id}`} className="recent-row">
                      <span className="recent-what">
                        <span className="recent-name">Autosaved session of a closed tab</span>
                        <span className="recent-meta">
                          {plural(s.sheets, "sheet")}{s.sheet ? `, last on “${s.sheet}”` : ""}, saved {when(s.savedAt)}
                        </span>
                      </span>
                      <span className="recent-actions">
                        <Button size="sm" onClick={() => restoreSession(s)}>
                          Restore<span className="sr-only">{which}</span>
                        </Button>
                      </span>
                    </li>
                  );
                })}
                {rp.versions.map((v) => {
                  const which = ` the version “${v.note}” of “${v.title}”`;
                  return (
                    <li key={`v-${v.id}`} className="recent-row">
                      <span className="recent-what">
                        <span className="recent-name">“{v.note}”</span>
                        <span className="recent-meta">
                          {plural(v.sheets, "sheet")}, {formatBytes(versionBytes(v.json))}, saved {when(v.savedAt)}
                        </span>
                      </span>
                      <span className="recent-actions">
                        <Button size="sm" onClick={() => restoreVersion(v)}>
                          Restore<span className="sr-only">{which}</span>
                        </Button>
                        {onCompare && (
                          <Button size="sm" onClick={() => onCompare(v)}>
                            Compare…<span className="sr-only">{which}</span>
                          </Button>
                        )}
                        <Button size="sm" onClick={() => { void remove(v); }}>
                          Delete<span className="sr-only">{which}</span>
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="field-note recent-storage">
        {room ?? "Checking this browser’s storage…"} Versions stay until you delete them here or
        forget this computer’s data (Preferences).
      </p>
    </Modal>
  );
}
