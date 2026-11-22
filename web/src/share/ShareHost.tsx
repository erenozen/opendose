import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { runEngine } from "../lib/engine";
import { exportPzfx, pzfxFileName, pzfxSelection } from "./pzfx";
import { resolveOptions } from "../app/analysis";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import Modal from "../components/Modal";
import { Banner, Button } from "../components/ui";
import { copyText, saveBlob } from "../export/download";
import { findSheet } from "../project/ops";
import { serializeProject } from "../project/persist";
import type { DataSheet, Project } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { hasShareLink, locationHash } from "./boot";
import { useBundleExport } from "./useBundleExport";
import { usePptxExport } from "../export/usePptxExport";
import type { PptxScope } from "../export/pptx";
import { SHARE_EVENT, type RecipeImportRequest, type ShareRequest, type ValidationFor } from "./events";
import { familyProject, kb, makeFragment, SHARE_LIMIT } from "./link";
import {
  makeProtectedFragment, MIN_PASSWORD, suggestPassword, type ProtectedOutcome,
} from "./protect";
import "./share.css";

const ValidationPage = lazy(() => import("./ValidationPage"));
const PrivacyPage = lazy(() => import("./PrivacyPage"));
const ReplayDialog = lazy(() => import("./ReplayDialog"));
const PptxDialog = lazy(() => import("../export/PptxDialog"));
const RecipeDialog = lazy(() => import("./RecipeDialog"));

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
  | { kind: "validation"; scope?: ValidationFor }
  | { kind: "privacy" }
  | { kind: "pptx"; from?: string | null; scope?: PptxScope }
  | { kind: "replay"; dataId?: string }
  | RecipeImportRequest;

/**
 * Sharing, interoperability and trust: answers the commands in
 * ./events (share link, export bundle, validation page), shows the
 * read-only banner of a project opened from a link, and reacts to a
 * share link pasted into the address bar of an open tab.
 */
export default function ShareHost() {
  const api = useProject();
  const ui = useUi();
  // "#validation" and "#privacy" open those pages directly (linkable).
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    (locationHash() === "#validation" ? { kind: "validation" }
      : locationHash() === "#privacy" ? { kind: "privacy" } : null));
  const bundle = useBundleExport();
  const runBundle = bundle.run;
  const pptx = usePptxExport();

  // Data tables as a .pzfx file (all of them, or one table's).
  const savePzfx = useCallback(async (dataId?: string) => {
    if (!api.engineReady) {
      ui.notify("The analysis engine is still starting; try again in a moment.", { tone: "info" });
      return;
    }
    const p = api.store.project;
    const sel = pzfxSelection(p, dataId);
    const r = await runEngine((engine) => exportPzfx(engine, sel), { priority: "user" });
    if ("error" in r) { ui.notify(r.error, { tone: "error" }); return; }
    const one = dataId ? findSheet(p, dataId)?.name : undefined;
    saveBlob(new Blob([r.xml], { type: "application/xml" }), pzfxFileName(one ?? p.title));
    ui.notify(`Saved ${sel.tables.length} table${sel.tables.length === 1 ? "" : "s"} as .pzfx`
      + (r.messages.length ? `. ${r.messages.join(". ")}.` : "."), { tone: "success" });
  }, [api, ui]);

  useEffect(() => {
    const onReq = (e: Event) => {
      const req = (e as CustomEvent<ShareRequest>).detail;
      if (req.kind === "bundle") void runBundle();
      else if (req.kind === "pzfx") void savePzfx(req.dataId);
      else setDialog(req);
    };
    // A share link pasted into an open tab only changes the hash: reload
    // so it opens the way a fresh visit does.
    const onHash = () => {
      if (hasShareLink()) window.location.reload();
      else if (locationHash() === "#validation") setDialog({ kind: "validation" });
      else if (locationHash() === "#privacy") setDialog({ kind: "privacy" });
    };
    window.addEventListener(SHARE_EVENT, onReq);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(SHARE_EVENT, onReq);
      window.removeEventListener("hashchange", onHash);
    };
  }, [runBundle, savePzfx]);

  const closeValidation = () => {
    setDialog(null);
    if (locationHash() === "#validation" || locationHash() === "#privacy") {
      try {
        history.replaceState(history.state, "", `${location.pathname}${location.search}`);
      } catch { /* ignore */ }
    }
  };

  const makeCopy = () => {
    // A new object, so the copy counts as a change and autosaves at once.
    const p = { ...api.store.project };
    api.replace(p, api.selectedId);
    ui.notify("Copied into this browser: edits now autosave here. The link stays as it was.",
      { tone: "success" });
  };

  return (
    <>
      <Banner tone="info" className="share-banner" open={api.readOnly}
        icon={(
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24l-.7.7" />
            <path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.14 8.62a3 3 0 0 0 4.24 4.24l.7-.7" />
          </svg>
        )}>
        <Banner.Title>Shared project. Make a copy to edit.</Banner.Title>
        <Banner.Detail>
          “{api.project.title}” opened from a link and is read-only; nothing
          from it is stored in this browser until you copy it.
        </Banner.Detail>
        <Banner.Actions>
          <Button variant="primary" onClick={makeCopy}>Make a copy</Button>
          <Button title="Leave the shared project and return to your own work"
            onClick={() => window.location.assign(`${location.pathname}${location.search}`)}>
            Close
          </Button>
        </Banner.Actions>
      </Banner>
      {dialog?.kind === "link" && (
        <ShareDialog dataId={dialog.dataId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "validation" && (
        <Suspense fallback={null}>
          <ValidationPage onClose={closeValidation} scope={dialog.scope} />
        </Suspense>
      )}
      {dialog?.kind === "privacy" && (
        <Suspense fallback={null}>
          <PrivacyPage onClose={closeValidation} />
        </Suspense>
      )}
      {dialog?.kind === "pptx" && (
        <Suspense fallback={null}>
          <PptxDialog from={dialog.from} initial={dialog.scope} onClose={() => setDialog(null)}
            onExport={(scope, o) => {
              setDialog(null);
              void pptx.run(scope, o).then((msg) => {
                if (msg) ui.notify(msg, { tone: msg.startsWith("Saved") ? "success" : "error" });
              });
            }} />
        </Suspense>
      )}
      {dialog?.kind === "replay" && (
        <Suspense fallback={null}>
          <ReplayDialog dataId={dialog.dataId} onClose={() => setDialog(null)} />
        </Suspense>
      )}
      {pptx.host}
      {pptx.busy && (
        <div className="share-progress" role="status" aria-live="polite">
          Preparing the PowerPoint file… {pptx.progress}
        </div>
      )}
      {dialog?.kind === "recipe" && (
        <Suspense fallback={null}>
          <RecipeDialog initialFiles={dialog.files} fresh={dialog.fresh} onClose={() => setDialog(null)} />
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
  const { store, results, selectedId } = useProject();
  // The link is a snapshot of the project as it is when the dialog opens.
  const [project] = useState(() => store.project);
  const family = useMemo(() => (dataId ? familyProject(project, dataId) : null), [project, dataId]);
  const target = family ?? project;
  const [withResults, setWithResults] = useState(true);
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  // Password protection is on by default: a link travels through e-mail,
  // chat and link scanners, and the data is inside it.
  const [protect, setProtect] = useState(true);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sealed, setSealed] = useState<ProtectedOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [sealError, setSealError] = useState("");
  const shareOpts = useMemo(() => ({ keys: results.fingerprints(), selected: selectedId }),
    [results, selectedId]);
  const current = useMemo(() => makeFragment(withResolvedOptions(target),
    withResults ? results.snapshot() : undefined, undefined, shareOpts),
  [target, withResults, results, shareOpts]);

  const base = `${location.origin}${location.pathname}${location.search}`;
  const outcome = protect ? sealed : current;
  const url = outcome?.ok ? `${base}${outcome.fragment}` : "";
  const what = family ? `“${family.title}”` : "this project";
  const tooShort = protect && password.length < MIN_PASSWORD;
  // Any change makes a new link: the old one no longer matches the dialog.
  const reset = () => { setSealed(null); setCopied(""); setSealError(""); };

  const seal = async () => {
    if (tooShort || busy) return;
    setBusy(true);
    try {
      setSealed(await makeProtectedFragment(withResolvedOptions(target), password,
        withResults ? results.snapshot() : undefined, undefined, shareOpts));
    } catch (e) {
      setSealError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => setCopied((await copyText(url)) ? "done" : "failed");
  const download = () => {
    const blob = new Blob([serializeProject(target, results.snapshot(),
      { keys: results.fingerprints(), selected: selectedId })], { type: "application/json" });
    const slug = target.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "opendose-project";
    saveBlob(blob, `${slug}.json`);
    onClose();
  };

  const tooLarge = !current.ok || (protect && sealed?.ok === false);
  const needsSeal = protect && !sealed;
  const submit = tooLarge ? download : needsSeal ? () => { void seal(); } : () => { void copy(); };

  return (
    <Modal title={family ? `Share “${family.title}”` : "Share this project"}
      className="share-dialog" onClose={onClose} onSubmit={submit}
      actions={!tooLarge ? (
        <>
          <button type="button" className="spacer" onClick={download}>Download file instead</button>
          <button type="button" onClick={onClose}>Done</button>
          {needsSeal ? (
            <button type="submit" className="btn-primary" disabled={tooShort || busy}>
              {busy ? "Locking…" : "Create protected link"}
            </button>
          ) : (
            <button type="submit" className="btn-primary">
              {copied === "done" ? "Copied" : "Copy link"}
            </button>
          )}
        </>
      ) : (
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Download project file</button>
        </>
      )}>
      {!tooLarge ? (
        <>
          <p className="modal-text">
            Anyone with this link can open a read-only copy of {what} in their
            browser, with no account, and make their own copy to edit. OpenDose
            uploads nothing, and the link does not change when you keep working.
          </p>
          <p className="share-warning" role="note">
            <strong>The data travel inside the link itself.</strong> Anyone who
            gets it, and any app it passes through (e-mail, chat, link previews,
            browser history), can read it{protect ? " without the password" : ""}.
            {protect
              ? " Send the password separately: by phone, in person or in another app, never in the same message as the link. A forgotten password cannot be recovered."
              : " For sensitive data, protect the link with a password, or send the project file through a channel your lab approves."}
          </p>
          <label className="field-check">
            <input type="checkbox" checked={protect}
              onChange={(e) => { setProtect(e.target.checked); reset(); }} />
            Protect with a password (recommended)
          </label>
          {protect && (
            <div className="share-password-row">
              <label className="field">
                <span>Password (at least {MIN_PASSWORD} characters)</span>
                <input type={showPassword ? "text" : "password"} value={password}
                  autoComplete="new-password" spellCheck={false} aria-label="Link password"
                  onChange={(e) => { setPassword(e.target.value); reset(); }} />
              </label>
              <button type="button" onClick={() => {
                setPassword(suggestPassword()); setShowPassword(true); reset();
              }}>Suggest one</button>
            </div>
          )}
          {protect && (
            <label className="field-check">
              <input type="checkbox" checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)} />
              Show the password
            </label>
          )}
          {url && (
            <label className="field">
              <span>{protect ? "Protected link" : "Link"}</span>
              <input className="share-url" readOnly value={url} aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()} />
            </label>
          )}
          <label className="field-check">
            <input type="checkbox" checked={withResults}
              onChange={(e) => { setWithResults(e.target.checked); reset(); }} />
            Include the computed results (the link opens with numbers shown at once)
          </label>
          <p className="field-note" role="status">
            {outcome?.ok ? kb(outcome.length) : `About ${kb(current.ok ? current.length : 0)}`}
            {withResults && outcome?.ok && !outcome.withResults
              ? ", without the computed results (they would not fit; they are recomputed on opening)"
              : ""}. Links stay under {kb(SHARE_LIMIT)} so they paste into e-mail and chat intact.
            {needsSeal && !tooShort && " Press Create protected link to lock it with this password."}
            {sealError && ` The link could not be locked: ${sealError}.`}
            {copied === "failed" && " The browser did not allow copying: select the link and copy it."}
          </p>
        </>
      ) : (
        <p className="modal-text" role="alert">
          {family ? `“${family.title}”` : "This project"} is too large for a
          link: about {kb(outcome?.length ?? current.length)}, and links are kept under {kb(SHARE_LIMIT)} so
          they paste into e-mail and chat intact. Send the project file
          instead; it opens in OpenDose with Open, in any browser.
        </p>
      )}
    </Modal>
  );
}
