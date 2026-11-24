// Compare with… (P-73): two of the open project, a saved version (P-72) or
// a project file, and the log of what differs between them: the reported
// numbers that moved (P first), values excluded or put back, options,
// cells and sheets. The diff is project/compareProjects.ts; each side's
// numbers are its results for its own data (app/projectResults.ts).
import { useEffect, useId, useState } from "react";
import { useProject } from "../app/context";
import { projectResults } from "../app/projectResults";
import { otherKv } from "../project/autosave";
import {
  compareProjects, diffSummary, type AnalysisDiff, type ProjectDiff, type TableDiff, type ValueLine,
} from "../project/compareProjects";
import { newId } from "../project/ids";
import { parseProjectFile } from "../project/persist";
import type { Project } from "../project/types";
import { listVersions, type VersionRecord } from "../project/versions";
import Modal from "./Modal";
import { Button, Field, FileButton, NumText, notify } from "./ui";
import "../report/report.css";
import "./versions.css";

const OPEN = "open";
const FILE = "file";
const when = (t: number) => new Date(t).toLocaleString();
const versionLabel = (v: VersionRecord) => `Version “${v.note}” of “${v.title}”, ${when(v.savedAt)}`;

export default function CompareDialog({ initial, onClose }: {
  /** Preselected as the earlier side (Compare… on a version). */
  initial?: VersionRecord | null;
  onClose: () => void;
}) {
  const { store, results } = useProject();
  const [versions, setVersions] = useState<VersionRecord[] | null>(null);
  const [file, setFile] = useState<{ name: string; project: Project } | null>(null);
  const [before, setBefore] = useState(initial ? initial.id : "");
  const [after, setAfter] = useState(OPEN);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<{ d: ProjectDiff; what: string } | null>(null);
  const beforeId = useId();
  const afterId = useId();

  useEffect(() => {
    let live = true;
    void listVersions(otherKv).then((v) => {
      if (!live) return;
      setVersions(v);
      // the newest version against the open project, unless one was picked
      setBefore((b) => b || v[0]?.id || "");
    }, () => { if (live) setVersions([]); });
    return () => { live = false; };
  }, []);

  const sources = [
    { value: OPEN, label: `The open project, “${store.project.title}”` },
    ...(file ? [{ value: FILE, label: `File “${file.name}”` }] : []),
    ...(versions ?? []).map((v) => ({ value: v.id, label: versionLabel(v) })),
  ];
  const labelOf = (value: string) => sources.find((s) => s.value === value)?.label ?? "";
  const projectOf = (value: string): Project | null => {
    if (value === OPEN) return store.project;
    if (value === FILE) return file?.project ?? null;
    const v = versions?.find((x) => x.id === value);
    return v ? parseProjectFile(v.json, { prefs: store.project.prefs, ids: newId }) : null;
  };

  const chooseFile = async (f: File) => {
    try {
      const project = parseProjectFile(await f.text(), { prefs: store.project.prefs, ids: newId });
      setFile({ name: f.name, project });
      setBefore(FILE);
      setDiff(null);
    } catch (e) {
      notify(`Could not read “${f.name}”: ${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}. `
        + "Choose an OpenDose project file (.json).", { tone: "error" });
    }
  };

  const problem = !before || !after ? "Choose the two projects to compare."
    : before === after ? "Choose two different projects." : null;

  const run = async () => {
    if (problem || busy) return;
    const a = projectOf(before);
    const b = projectOf(after);
    if (!a || !b) return;
    setBusy(true);
    setDiff(null);
    try {
      // only results that are not saved for their data are computed
      const ra = await projectResults(a, before === OPEN ? results : undefined);
      const rb = await projectResults(b, after === OPEN ? results : undefined);
      const d = compareProjects({ project: a, ...ra }, { project: b, ...rb });
      setDiff({ d, what: `${labelOf(before)} → ${labelOf(after)}` });
    } catch (e) {
      notify(`Could not compare the two projects: ${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}.`,
        { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const select = (id: string, value: string, set: (v: string) => void) => (
    <select id={id} value={value} onChange={(e) => { set(e.target.value); setDiff(null); }}>
      {!value && <option value="">Choose…</option>}
      {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );

  return (
    <Modal title="Compare two versions" className="modal-wide compare-dialog" onClose={onClose}
      onSubmit={() => { void run(); }}
      actions={(
        <>
          <Button onClick={onClose}>Close</Button>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Comparing…">Compare</Button>
        </>
      )}>
      <div className="compare-sides">
        <Field label="Earlier" id={beforeId}>{select(beforeId, before, setBefore)}</Field>
        <Field label="Later" id={afterId}>{select(afterId, after, setAfter)}</Field>
      </div>
      <div className="compare-file">
        <FileButton size="sm" accept=".json,application/json" inputLabel="A project file to compare"
          onFile={(f) => void chooseFile(f)}>Compare with a project file…</FileButton>
        {versions !== null && versions.length === 0 && !file && (
          <span className="field-note">
            No saved versions in this browser yet: save one with File › Save a version….
          </span>
        )}
        {/* Mounted before it has anything to say, beside the file button so
            an empty line takes no row of its own. */}
        <span className="field-note" role="status">
          {busy ? "Computing the results to compare…"
            : problem && versions !== null ? problem : ""}
        </span>
      </div>
      {diff && <CompareLog d={diff.d} what={diff.what} />}
    </Modal>
  );
}

const valueLine = (v: ValueLine) => `${v.group}, ${v.where}: ${v.value}${v.reason ? ` (${v.reason})` : ""}`;

function Analysis({ a }: { a: AnalysisDiff }) {
  const status = a.status === "changed" ? `${a.changes.length + a.more} number${a.changes.length + a.more === 1 ? "" : "s"} moved`
    : a.status === "same" ? "no number moved" : a.note ?? "not compared";
  return (
    <div className="history-step">
      <h3>{a.name}</h3>
      <p className="hs-meta">Analysis of “{a.table}” · {status}</p>
      {a.changes.length > 0 && (
        <ul aria-label={`Numbers that moved in ${a.name}`}>
          {a.changes.map((c) => <li key={c.label}><NumText text={`${c.label}: ${c.text}`} /></li>)}
          {a.more > 0 && <li>and {a.more} more</li>}
        </ul>
      )}
      {a.leftOutAdded.length > 0 && (
        <ul aria-label={`Values left out of ${a.name}`}>
          {a.leftOutAdded.map((v, i) => <li key={i}><NumText text={`Left out: ${valueLine(v)}`} /></li>)}
        </ul>
      )}
      {a.leftOutRemoved.length > 0 && (
        <ul aria-label={`Values put back into ${a.name}`}>
          {a.leftOutRemoved.map((v, i) => <li key={i}><NumText text={`Put back: ${valueLine(v)}`} /></li>)}
        </ul>
      )}
      {a.options.length > 0 && (
        <ul aria-label={`Options changed in ${a.name}`}>
          {a.options.map((o) => <li key={o.key}><NumText text={`Option ${o.key}: ${o.before} → ${o.after}`} /></li>)}
        </ul>
      )}
    </div>
  );
}

function Table({ t }: { t: TableDiff }) {
  return (
    <div className="history-step">
      <h3>Data table: {t.name}</h3>
      {t.notes.length > 0 && <p className="hs-meta">{t.notes.join(" · ")}</p>}
      {t.excludedAdded.length > 0 && (
        <ul aria-label={`Values excluded in ${t.name}`}>
          {t.excludedAdded.map((v, i) => <li key={i}><NumText text={`Excluded: ${valueLine(v)}`} /></li>)}
        </ul>
      )}
      {t.excludedRemoved.length > 0 && (
        <ul aria-label={`Exclusions removed in ${t.name}`}>
          {t.excludedRemoved.map((v, i) => <li key={i}><NumText text={`Put back: ${valueLine(v)}`} /></li>)}
        </ul>
      )}
      {t.cells.length > 0 && (
        <ul aria-label={`Cells changed in ${t.name}`}>
          {t.cells.map((c, i) => (
            <li key={i}><NumText text={`${c.where}: ${c.before || "(blank)"} → ${c.after || "(blank)"}`} /></li>
          ))}
          {t.cellsMore > 0 && <li>and {t.cellsMore} more cells</li>}
        </ul>
      )}
    </div>
  );
}

function CompareLog({ d, what }: { d: ProjectDiff; what: string }) {
  // Analyses whose numbers or setup changed come first; the rest are named once.
  const moved = d.analyses.filter((a) => a.status !== "same" || a.options.length
    || a.leftOutAdded.length || a.leftOutRemoved.length);
  const same = d.analyses.filter((a) => !moved.includes(a));
  return (
    <section className="compare-log" aria-label="Differences">
      <p className="compare-what">{what}</p>
      <p className="compare-summary">{diffSummary(d)}</p>
      {d.title && <p className="hs-meta">Title: “{d.title.before}” → “{d.title.after}”</p>}
      {moved.map((a) => <Analysis key={`${a.table}-${a.name}`} a={a} />)}
      {d.tables.map((t) => <Table key={t.name} t={t} />)}
      {(d.added.length > 0 || d.removed.length > 0) && (
        <div className="history-step">
          <h3>Sheets</h3>
          <ul aria-label="Sheets added or removed">
            {d.added.map((s) => <li key={`+${s}`}>Added: {s}</li>)}
            {d.removed.map((s) => <li key={`-${s}`}>Removed: {s}</li>)}
          </ul>
        </div>
      )}
      {same.length > 0 && (
        <p className="hs-meta">No number moved in {same.map((a) => `“${a.name}”`).join(", ")}.</p>
      )}
    </section>
  );
}
