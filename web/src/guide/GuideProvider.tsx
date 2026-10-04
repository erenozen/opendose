// Provides the guidance services (guide/context.ts) and renders their
// overlays: the "Which test?" wizard, the Help panel (Ctrl/Cmd+/) and the
// guided tour. The start screen is rendered by the shell, which owns file
// opening; this provider only says whether it is showing.
import "./guide.css";
import {
  lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { exampleRequested, shareLinkRequested, GuideCtx, setTourDone, startScreenEnabled, type GuideApi } from "./context";

// The overlays load on first use.
const HelpPanel = lazy(() => import("./HelpPanel"));
const Tour = lazy(() => import("./Tour"));
const WhichTest = lazy(() => import("./WhichTest"));

export function GuideProvider({ children }: { children: ReactNode }) {
  const [wizard, setWizard] = useState(false);
  const [help, setHelp] = useState<{ topic: string | null } | null>(null);
  const [tour, setTour] = useState(false);
  const [startOpen, setStartOpen] = useState(
    () => !exampleRequested() && !shareLinkRequested() && startScreenEnabled());

  const openWizard = useCallback(() => { setHelp(null); setWizard(true); }, []);
  const openHelp = useCallback((id?: string) => setHelp({ topic: id ?? null }), []);
  const closeHelp = useCallback(() => setHelp(null), []);
  const startTour = useCallback(() => { setHelp(null); setStartOpen(false); setTour(true); }, []);
  const showStart = useCallback(() => { setHelp(null); setTour(false); setStartOpen(true); }, []);
  const hideStart = useCallback(() => setStartOpen(false), []);

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
    openWizard, openHelp, closeHelp, helpOpen: !!help, startTour, startOpen, showStart, hideStart,
  }), [openWizard, openHelp, closeHelp, help, startTour, startOpen, showStart, hideStart]);

  return (
    <GuideCtx.Provider value={api}>
      {children}
      <Suspense fallback={null}>
        {wizard && <WhichTest onClose={() => setWizard(false)} />}
        {help && (
          <HelpPanel initial={help.topic} onClose={closeHelp} onWizard={openWizard}
            onTour={startTour} onStart={showStart} />
        )}
        {tour && <Tour onDone={() => { setTour(false); setTourDone(); }} />}
      </Suspense>
    </GuideCtx.Provider>
  );
}
