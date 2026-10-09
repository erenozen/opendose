import "./App.css";
import "./export/export.css";
import "./layout/layout.css";
import "./app/organise.css";
import "./app/print.css";
import { useProject } from "./app/context";
import { blankProject } from "./app/factory";
import { ProjectProvider } from "./app/ProjectContext";
import { useUi } from "./app/ui";
import { UiProvider } from "./app/UiProvider";
import { useAutosave } from "./app/useAutosave";
import { useFileOpen } from "./app/useFileOpen";
import { useDerivedSync } from "./app/useDerivedSync";
import { useBackgroundRefresh } from "./app/useBackgroundRefresh";
import { usePrintSetup } from "./app/usePrint";
import { useShortcuts } from "./app/useShortcuts";
import FamilyWorkspace from "./components/FamilyWorkspace";
import FloatingNotes from "./components/FloatingNotes";
import Header from "./components/Header";
import InfoSheetView from "./components/InfoSheetView";
import Navigator from "./components/Navigator";
import { newId } from "./project/ids";
import { familyRootId, findSheet } from "./project/ops";
import { SimulateHost } from "./sheets/manipulate/SimulateDialog";
import ShareHost from "./share/ShareHost";
import { useGuide } from "./guide/context";
import { GuideProvider } from "./guide/GuideProvider";
import ReportHost from "./report/ReportHost";
import ReproduceStrip from "./report/ReproduceStrip";
import PowerHost from "./power/PowerHost";
import { lazy, Suspense, useEffect } from "react";

// The page-layout composer is loaded the first time a layout sheet opens.
const LayoutSheetView = lazy(() => import("./components/LayoutSheetView"));
// The start screen is a chunk of its own too.
const StartScreen = lazy(() => import("./guide/StartScreen"));

export default function App() {
  return (
    <ProjectProvider>
      <UiProvider>
        <GuideProvider>
          <Shell />
        </GuideProvider>
      </UiProvider>
    </ProjectProvider>
  );
}

function Shell() {
  const { project, selectedId, replace, store } = useProject();
  const ui = useUi();
  const guide = useGuide();
  const files = useFileOpen();
  const autosave = useAutosave();
  useShortcuts();
  useDerivedSync();
  useBackgroundRefresh();
  usePrintSetup();

  // Default start mode: once the autosave has been looked at, a last
  // session opens directly; with none (first visit, or after "New
  // project") the start screen shows.
  const { startPending, resolveStart } = guide;
  const { checked: autosaveChecked, offer, restore } = autosave;
  useEffect(() => {
    if (!startPending || !autosaveChecked) return;
    if (offer) restore({ auto: true });
    resolveStart(!!offer);
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
    guide.hideStart();
  };
  const openFile = (f: File) => { guide.hideStart(); files.open(f); };

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
            <button className="btn-primary" onClick={ui.openNewTable}>New data table</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className={`app${guide.startOpen ? " start-open" : ""}`}>
      <Header onOpenFile={openFile} onNewProject={newProject} />
      <ShareHost />
      <ReportHost />
      <ReproduceStrip />
      {autosave.offer && !guide.startPending && (
        <div className="restore-banner" role="region" aria-label="Restore last session">
          <span>
            Restore your last session? “{autosave.offer.title}”, {autosave.offer.sheets}{" "}
            sheet{autosave.offer.sheets === 1 ? "" : "s"}, saved{" "}
            {new Date(autosave.offer.savedAt).toLocaleString()}.
          </span>
          <button className="btn-primary"
            onClick={() => { autosave.restore(); guide.hideStart(); }}>Restore</button>
          <button className="dismiss" onClick={autosave.dismiss}>Dismiss</button>
        </div>
      )}
      {files.prismTables && (
        <div className="pzfx-chooser">
          <span>Prism file contains {files.prismTables.length} data tables. Pick
            one to import, or import them all as separate tables (data tables only:
            analyses are recomputed here):</span>
          {files.prismTables.map((t, i) => (
            <button key={i} onClick={() => files.importTables([t])}>
              {t.title || `Table ${i + 1}`} ({t.table_type})
            </button>
          ))}
          <button onClick={() => files.importTables(files.prismTables!)}>Import all</button>
          <button className="dismiss" onClick={files.dismissPrism}>Cancel</button>
        </div>
      )}
      {guide.startPending ? (
        <main className="info-main" aria-busy="true" aria-label="Opening OpenDose" />
      ) : guide.startOpen ? (
        <Suspense fallback={<main className="info-main" aria-busy="true" />}>
          <StartScreen onOpenFile={files.open} onClose={guide.hideStart} onTour={guide.startTour} />
        </Suspense>
      ) : (
      <div className={`shell${ui.navOpen ? "" : " nav-hidden"}`}>
        {ui.drawerOpen && (
          <div className="nav-scrim" aria-hidden="true" onClick={() => ui.setDrawerOpen(false)} />
        )}
        <Navigator />
        <div className="workbench">
          {sheet && <FloatingNotes sheet={sheet} />}
          {view}
        </div>
      </div>
      )}
      <SimulateHost />
      <PowerHost />
    </div>
  );
}
