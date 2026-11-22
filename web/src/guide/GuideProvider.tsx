// Provides the guidance services (guide/context.ts) and renders their
// overlays: the "Which test?" wizard, the Help panel (Ctrl/Cmd+/) and the
// guided tour. It also says whether the shell is still looking for the
// last session before it shows the workbench.
import "./guide.css";
import {
  lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { requestShell } from "../app/commandRegistry";
import {
  dropStartScreenPref, exampleRequested, shareLinkRequested, GuideCtx, setTourDone, type GuideApi,
} from "./context";

// The overlays load on first use.
const HelpPanel = lazy(() => import("./HelpPanel"));
const Tour = lazy(() => import("./Tour"));
const WhichTest = lazy(() => import("./WhichTest"));
const PlanExperiment = lazy(() => import("./PlanExperiment"));

export function GuideProvider({ children }: { children: ReactNode }) {
  const [wizard, setWizard] = useState(false);
  const [planner, setPlanner] = useState(false);
  const [help, setHelp] = useState<{ topic: string | null } | null>(null);
  const [tour, setTour] = useState(false);
  // `?example=1` and share links open their project directly. Otherwise
  // the shell checks the autosave first (resolveStart): the last session
  // reopens, and a first visit lands on the example (DECISIONS 4).
  const [startPending, setStartPending] = useState(() => {
    dropStartScreenPref();
    return !exampleRequested() && !shareLinkRequested();
  });
  const resolveStart = useCallback(() => setStartPending(false), []);

  const openWizard = useCallback(() => { setHelp(null); setWizard(true); }, []);
  const openPlanner = useCallback(() => { setHelp(null); setPlanner(true); }, []);
  const openHelp = useCallback((id?: string) => setHelp({ topic: id ?? null }), []);
  const closeHelp = useCallback(() => setHelp(null), []);
  const startTour = useCallback(() => { setHelp(null); setTour(true); }, []);
  // Help's "Open the example project": the shell asks before it replaces
  // the open project.
  const openExample = useCallback(() => {
    setHelp(null); setTour(false); requestShell("example");
  }, []);

  // Ctrl/Cmd+/ toggles the Help panel from anywhere (also inside fields:
  // the combination types nothing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "/") {
        if (document.querySelector("dialog[open]")) return;
        e.preventDefault();
        setHelp((h) => (h ? null : { topic: null }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const api = useMemo<GuideApi>(() => ({
    openWizard, openPlanner, openHelp, closeHelp, helpOpen: !!help, startTour, startPending,
    resolveStart,
  }), [openWizard, openPlanner, openHelp, closeHelp, help, startTour, startPending, resolveStart]);

  return (
    <GuideCtx.Provider value={api}>
      {children}
      <Suspense fallback={null}>
        {wizard && <WhichTest onClose={() => setWizard(false)} />}
        {planner && <PlanExperiment onClose={() => setPlanner(false)} />}
        {help && (
          <HelpPanel initial={help.topic} onClose={closeHelp} onWizard={openWizard}
            onTour={startTour} onExample={openExample} />
        )}
        {tour && <Tour onDone={() => { setTour(false); setTourDone(); }} />}
      </Suspense>
    </GuideCtx.Provider>
  );
}
