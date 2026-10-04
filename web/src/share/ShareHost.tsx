import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { resolveOptions } from "../app/analysis";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import Modal from "../components/Modal";
import { copyText, saveBlob } from "../export/download";
import { findSheet } from "../project/ops";
import { serializeProject } from "../project/persist";
import type { DataSheet, Project } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { hasShareLink, locationHash } from "./boot";
import { useBundleExport } from "./useBundleExport";
import { SHARE_EVENT, type ShareRequest } from "./events";
import { familyProject, kb, makeFragment, SHARE_LIMIT } from "./link";
import "./share.css";

const ValidationPage = lazy(() => import("./ValidationPage"));

/** Results-sheet options written out in full, with the sender's
 *  preferences applied, so a link computes the same numbers in a browser
 *  with other preferences (the link itself carries no preferences). */
function withResolvedOptions(p: Project): Project {
  return {
    ...p,
    sheets: p.sheets.map((s) => {
      if (s.kind !== "results") return s;
      const data = findSheet(p, s.parentId) as DataSheet | undefined;
      if (!data || data.kind !== "data") return s;
      const def = analysisDef(data.table.type, s.analysis);
      return { ...s, options: resolveOptions(def, s.options, data.table, p.prefs) };
    }),
  };
}

type Dialog =
  | { kind: "link"; dataId?: string }
  | { kind: "validation" };

/**
 * Sharing, interoperability and trust: answers the commands in
 * ./events (share link, export bundle, validation page), shows the
 * read-only banner of a project opened from a link, and reacts to a
 * share link pasted into the address bar of an open tab.
 */
export default function ShareHost() {
  const api = useProject();
  const ui = useUi();
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    (locationHash() === "#validation" ? { kind: "validation" } : null));
  const bundle = useBundleExport();
  const runBundle = bundle.run;

  useEffect(() => {
    const onReq = (e: Event) => {
      const req = (e as CustomEvent<ShareRequest>).detail;
      if (req.kind === "bundle") void runBundle();
      else setDialog(req);
    };
    // A share link pasted into an open tab only changes the hash: reload
    // so it opens the way a fresh visit does.
    const onHash = () => {
      if (hasShareLink()) window.location.reload();
      else if (locationHash() === "#validation") setDialog({ kind: "validation" });
    };
    window.addEventListener(SHARE_EVENT, onReq);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(SHARE_EVENT, onReq);
      window.removeEventListener("hashchange", onHash);
    };
  }, [runBundle]);

  const closeValidation = () => {
    setDialog(null);
    if (locationHash() === "#validation") {
      try {
        history.replaceState(history.state, "", `${location.pathname}${location.search}`);
      } catch { /* ignore */ }
    }
  };

  const makeCopy = () => {
    // A new object, so the copy counts as a change and autosaves at once.
    const p = { ...api.store.project };
    api.replace(p, api.selectedId);
    ui.notify("Copied into this browser: edits now autosave here. The link stays as it was.");
  };

  return (
    <>
      {api.readOnly && (
        <div className="share-banner" role="region" aria-label="Shared project">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24l-.7.7" />
            <path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.14 8.62a3 3 0 0 0 4.24 4.24l.7-.7" />
          </svg>
          <span>
            <strong>Shared project. Make a copy to edit.</strong>{" "}
            “{api.project.title}” opened from a link and is read-only; nothing
            from it is stored in this browser until you copy it.
          </span>
          <button type="button" className="btn-primary" onClick={makeCopy}>Make a copy</button>
          <button type="button" className="dismiss"
            title="Leave the shared project and return to your own work"
            onClick={() => window.location.assign(`${location.pathname}${location.search}`)}>
            Close
          </button>
        </div>
      )}
      {dialog?.kind === "link" && (
        <ShareDialog dataId={dialog.dataId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "validation" && (
        <Suspense fallback={null}>
          <ValidationPage onClose={closeValidation} />
        </Suspense>
      )}
      {bundle.host}
      {bundle.busy && (
        <div className="share-progress" role="status" aria-live="polite">
          Preparing the export bundle… {bundle.progress}
        </div>
      )}
    </>
  );
}

function ShareDialog({ dataId, onClose }: { dataId?: string; onClose: () => void }) {
  const { store, results } = useProject();
  // The link is a snapshot of the project as it is when the dialog opens.
  const [project] = useState(() => store.project);
  const family = useMemo(() => (dataId ? familyProject(project, dataId) : null), [project, dataId]);
  const target = family ?? project;
  const [withResults, setWithResults] = useState(true);
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  const current = useMemo(() => makeFragment(withResolvedOptions(target),
    withResults ? results.snapshot() : undefined), [target, withResults, results]);

  const base = `${location.origin}${location.pathname}${location.search}`;
  const url = current.ok ? `${base}${current.fragment}` : "";
  const what = family ? `“${family.title}”` : "this project";

  const copy = async () => setCopied((await copyText(url)) ? "done" : "failed");
  const download = () => {
    const blob = new Blob([serializeProject(target, results.snapshot())], { type: "application/json" });
    const slug = target.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "opendose-project";
    saveBlob(blob, `${slug}.json`);
    onClose();
  };

  return (
    <Modal title={family ? `Share “${family.title}”` : "Share this project"}
      className="share-dialog" onClose={onClose}
      onSubmit={current.ok ? () => { void copy(); } : download}
      actions={current.ok ? (
        <>
          <button type="button" className="spacer" onClick={download}>Download file instead</button>
          <button type="button" onClick={onClose}>Done</button>
          <button type="submit" className="btn-primary">
            {copied === "done" ? "Copied" : "Copy link"}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Download project file</button>
        </>
      )}>
      {current.ok ? (
        <>
          <p className="modal-text">
            Anyone with this link can open a read-only copy of {what} in their
            browser, with no account, and make their own copy to edit. The data
            travel inside the link itself: nothing is uploaded, and the link
            does not change when you keep working.
          </p>
          <label className="field">
            <span>Link</span>
            <input className="share-url" readOnly value={url} aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()} />
          </label>
          <label className="field-check">
            <input type="checkbox" checked={withResults}
              onChange={(e) => { setWithResults(e.target.checked); setCopied(""); }} />
            Include the computed results (the link opens with numbers shown at once)
          </label>
          <p className="field-note" role="status">
            {kb(current.length)}{withResults && !current.withResults
              ? ", without the computed results (they would not fit; they are recomputed on opening)"
              : ""}. Links stay under {kb(SHARE_LIMIT)} so they paste into e-mail and chat intact.
            {copied === "failed" && " The browser did not allow copying: select the link and copy it."}
          </p>
        </>
      ) : (
        <p className="modal-text" role="alert">
          {family ? `“${family.title}”` : "This project"} is too large for a
          link: about {kb(current.length)}, and links are kept under {kb(current.limit)} so
          they paste into e-mail and chat intact. Send the project file
          instead; it opens in OpenDose with Open, in any browser.
        </p>
      )}
    </Modal>
  );
}
