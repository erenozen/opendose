import "./styles/index.css";
import "./export/export.css";
import "./layout/layout.css";
import "./app/organise.css";
import "./app/print.css";
import { useProject } from "./app/context";
import { onShellRequest } from "./app/commandRegistry";
import { blankProject, defaultTableName, sampleProject } from "./app/factory";
import { ProjectProvider } from "./app/ProjectContext";
import { primeSampleResults } from "./app/sampleResults";
import { useUi } from "./app/ui";
import { UiProvider } from "./app/UiProvider";
import { useAutosave } from "./app/useAutosave";
import { useFileOpen } from "./app/useFileOpen";
import { useDerivedSync } from "./app/useDerivedSync";
import { useCalculatedSync } from "./app/useCalculatedSync";
import { useBackgroundRefresh } from "./app/useBackgroundRefresh";
import { usePrintSetup } from "./app/usePrint";
import { useShortcuts } from "./app/useShortcuts";
import { DRAWER_QUERY, useMedia } from "./app/breakpoints";
import ErrorBoundary from "./components/ErrorBoundary";
import FamilyWorkspace from "./components/FamilyWorkspace";
import FloatingNotes from "./components/FloatingNotes";
import Header from "./components/Header";
import InfoSheetView from "./components/InfoSheetView";
import Navigator from "./components/Navigator";
import { newId } from "./project/ids";
import { familyRootId, findSheet, makeProject } from "./project/ops";
import type { Project } from "./project/types";
import type { PrismTable } from "./app/factory";
import { tableDef } from "./sheets/registry";
import { SimulateHost } from "./sheets/manipulate/SimulateDialog";
import ShareHost from "./share/ShareHost";
import { takeTableDrop } from "./share/recipes/readFiles";
import { useGuide } from "./guide/context";
import { GuideProvider } from "./guide/GuideProvider";
import { projectWithTable } from "./guide/actions";
import DesignDialog from "./guide/DesignDialog";
import { isExampleProject, markExample } from "./guide/firstRun";
import { usePasteAnywhere } from "./guide/usePasteAnywhere";
import ReportHost from "./report/ReportHost";
import ReproduceStrip from "./report/ReproduceStrip";
import PowerHost from "./power/PowerHost";
import { Banner, Button, lastInputWasKeyboard, notify, ToastProvider } from "./components/ui";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

// The page-layout composer is loaded the first time a layout sheet opens.
const LayoutSheetView = lazy(() => import("./components/LayoutSheetView"));

/** Files Open takes, also by dropping them on the page. */
const OPENABLE = /\.(json|pzfx|prism|zip)$/i;

export default function App() {
  return (
    <ToastProvider>
      <ProjectProvider>
        <UiProvider>
          <GuideProvider>
            <ErrorBoundary>
              <Shell />
            </ErrorBoundary>
          </GuideProvider>
        </UiProvider>
      </ProjectProvider>
    </ToastProvider>
  );
}

/** Tables imported from a Prism file go into the open project, unless it
 *  is still the first-run example: then they take its place. */
const importInto = (p: Project) => (isExampleProject(p)
  ? makeProject(p.prefs, [], "Untitled project") : p);

function Shell() {
  const { project, selectedId, replace, store, apply, select, readOnly, results } = useProject();
  const ui = useUi();
  const guide = useGuide();
  const files = useFileOpen(importInto);
  const autosave = useAutosave();
  useShortcuts();
  useDerivedSync();
  useCalculatedSync();
  useBackgroundRefresh();
  usePrintSetup();
  usePasteAnywhere();
  useDropOpen(files.open);

  // The project the app opens with is the example (unless a share link
  // brought one): its tables are labelled "Example data" and a paste
  // replaces it (DECISIONS 4).
  useState(() => { if (!readOnly) markExample(store.project); return null; });

  // Once the autosave has been looked at, a last session reopens directly;
  // with none (a first visit, or after "New project") the example stays.
  const { startPending, resolveStart } = guide;
  const { checked: autosaveChecked, offer, restore } = autosave;
  useEffect(() => {
    if (!startPending || !autosaveChecked) return;
    if (offer) restore({ auto: true });
    resolveStart();
  }, [startPending, autosaveChecked, offer, restore, resolveStart]);

  const newProject = async () => {
    const ok = await ui.confirm({
      title: "Start a new project?",
      body: "The open project is closed and its autosave is cleared. Save it first if you want to keep it.",
      confirmLabel: "New project",
    });
    if (!ok) return;
    const p = blankProject(store.project.prefs, newId);
    autosave.markClean(p);
    autosave.forgetCurrent();
    replace(p);
  };

  // The example project, "Describe your experiment" and "Plan an
  // experiment": shell requests from the File menu and the palette.
  const [describing, setDescribing] = useState(false);
  const shell = useRef({ openExample: async () => {}, plan: () => {} });
  shell.current = {
    openExample: async () => {
      if (isExampleProject(store.project)) return;
      const ok = await ui.confirm({
        title: "Open the example project?",
        body: "The open project is closed. Save it first if you want to keep it as a file.",
        confirmLabel: "Open the example",
      });
      if (!ok) return;
      const p = sampleProject(store.project.prefs, newId);
      // Not written over the last session until the example is changed.
      autosave.markClean(p);
      markExample(p);
      replace(p);
      primeSampleResults(p, results);
    },
    plan: guide.openPlanner,
  };
  useEffect(() => onShellRequest((kind) => {
    if (kind === "example") void shell.current.openExample();
    else if (kind === "describe") setDescribing(true);
    else if (kind === "plan") shell.current.plan();
  }), []);

  // At 900px and below the open navigator drawer is a modal dialog:
  // everything behind it is inert (DECISIONS 5).
  const behindDrawer = useMedia(DRAWER_QUERY) && ui.drawerOpen;
  // Opened or closed from the keyboard (Enter on the toggle, Escape), the
  // drawer and its scrim move at once (motion.md: keyboard actions never
  // animate). Read when the state flips, before the commit.
  const [drawerWas, setDrawerWas] = useState(behindDrawer);
  const [drawerInstant, setDrawerInstant] = useState(false);
  if (drawerWas !== behindDrawer) {
    setDrawerWas(behindDrawer);
    setDrawerInstant(lastInputWasKeyboard());
  }

  const sheet = findSheet(project, selectedId);
  const root = sheet ? findSheet(project, familyRootId(project, sheet.id)) : undefined;

  let view: React.ReactNode;
  if (sheet?.kind === "info") view = <InfoSheetView sheet={sheet} />;
  else if (sheet?.kind === "layout") {
    view = (
      <Suspense fallback={<main className="info-main" aria-busy="true" />}>
        <LayoutSheetView sheet={sheet} />
      </Suspense>
    );
  }
  else if (root?.kind === "data") view = <FamilyWorkspace key={root.id} data={root} />;
  else {
    view = (
      <main className="info-main">
        <div className="result-card empty-hint">
          This project has no sheets. Create a data table to begin.
          <div className="table-actions" style={{ justifyContent: "center" }}>
            <Button variant="primary" onClick={ui.openNewTable}>New data table</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      {!guide.startPending && (
        // The hash would replace a share link's: focus the sheet directly.
        <a className="skip-link" href="#sheet" onClick={(e) => {
          e.preventDefault();
          document.getElementById("sheet")?.focus();
        }}>Skip to the sheet</a>
      )}
      <Header onOpenFile={(f) => { void files.open(f); }} onNewProject={newProject} inert={behindDrawer} />
      {/* Conditions about the whole project, under the header (one
          Banner each, DECISIONS 6). */}
      <div className="banner-region" inert={behindDrawer}>
        <ShareHost />
        <ReproduceStrip />
        <Banner tone="info" className="restore-banner"
          open={!!autosave.offer && !guide.startPending}>
          {autosave.offer && (
            <>
              <Banner.Title>Restore your last session?</Banner.Title>
              <Banner.Detail>
                “{autosave.offer.title}”, {autosave.offer.sheets}{" "}
                sheet{autosave.offer.sheets === 1 ? "" : "s"}, saved{" "}
                {new Date(autosave.offer.savedAt).toLocaleString()}.
              </Banner.Detail>
              <Banner.Actions>
                <Button variant="primary" onClick={() => autosave.restore()}>Restore</Button>
                <Button onClick={autosave.dismiss}>Dismiss</Button>
              </Banner.Actions>
            </>
          )}
        </Banner>
        <Banner tone="info" className="pzfx-chooser" open={!!files.prismTables} announce>
          {files.prismTables && (
            <PrismChooser tables={files.prismTables} onImport={files.importTables}
              onCancel={files.dismissPrism} />
          )}
        </Banner>
      </div>
      <ReportHost />
      {guide.startPending ? (
        <main className="info-main" aria-busy="true" aria-label="Opening OpenDose" />
      ) : (
      <div className={`shell${ui.navOpen ? "" : " nav-hidden"}`}
        data-drawer-instant={drawerInstant || undefined}>
        {/* Always mounted, so it fades out with the drawer; a press
            on it closes the drawer (Navigator's light dismiss). */}
        <div className="nav-scrim" aria-hidden="true" data-open={behindDrawer || undefined} />
        <Navigator />
        <div className="workbench" id="sheet" tabIndex={-1} inert={behindDrawer}>
          {sheet && <FloatingNotes sheet={sheet} />}
          {view}
        </div>
      </div>
      )}
      {describing && (
        <DesignDialog action="Create this table" onClose={() => setDescribing(false)}
          onPick={(r) => {
            setDescribing(false);
            const table = tableDef(r.type).defaultTable(r.init);
            let dataId = "";
            apply((p) => {
              const made = projectWithTable(p, table, defaultTableName(p), newId, isExampleProject(p));
              dataId = made.dataId;
              return made.project;
            });
            if (dataId) select(dataId);
          }} />
      )}
      <SimulateHost />
      <PowerHost />
    </div>
  );
}

/** The Prism file's data tables as a checklist (all ticked), so a file
 *  with 74 tables is a scrolling list and one Import button, not 74
 *  buttons. */
function PrismChooser({ tables, onImport, onCancel }: {
  tables: PrismTable[];
  onImport: (t: PrismTable[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set(tables.map((_, i) => i)));
  const n = picked.size;
  const toggle = (i: number) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  return (
    <>
      <Banner.Title>
        The Prism file has {tables.length} data tables. Choose the ones to import.
      </Banner.Title>
      <Banner.Detail>
        <p>Each becomes a data table of its own; data tables only, analyses are recomputed here.</p>
        <fieldset className="pzfx-list">
          <legend className="sr-only">Data tables to import</legend>
          {tables.map((t, i) => (
            <label key={i} className="check-row">
              <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
              <span>{t.title || `Table ${i + 1}`} ({t.table_type})</span>
            </label>
          ))}
        </fieldset>
      </Banner.Detail>
      <Banner.Actions>
        <Button variant="primary" disabled={n === 0}
          onClick={() => onImport(tables.filter((_, i) => picked.has(i)))}>
          {n === tables.length ? "Import all" : `Import ${n} table${n === 1 ? "" : "s"}`}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Banner.Actions>
    </>
  );
}

/** A project or Prism file dropped anywhere on the page opens, as Open
 *  does; several CSV files, or a zip of them, go to the table import.
 *  Drops a pane handles itself (the navigator, the import dialog) are
 *  left to it. */
function useDropOpen(open: (f: File) => void) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const onOver = (e: DragEvent) => {
      if (!e.defaultPrevented && hasFiles(e) && !document.querySelector("dialog[open]")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (e.defaultPrevented || !hasFiles(e) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      const list = [...(e.dataTransfer?.files ?? [])];
      if (takeTableDrop(list, (f) => openRef.current(f), () => {})) return;
      const f = list.find((x) => OPENABLE.test(x.name));
      if (f) openRef.current(f);
      else if (list[0]) {
        notify(`Could not open “${list[0].name}”: OpenDose opens its own project files (.json) `
          + "and Prism files (.prism, .pzfx). To use a spreadsheet, copy its cells and paste them "
          + "on this page.", { tone: "error" });
      }
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
