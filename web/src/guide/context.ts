// Guidance services (provided by GuideProvider): the "Which test?" wizard,
// the Help panel with explainers, the guided tour and the start screen.
import { createContext, useContext } from "react";

export interface GuideApi {
  openWizard: () => void;
  /** "Plan an experiment…": the design questions before any data. */
  openPlanner: () => void;
  /** Open the Help panel, optionally at one explainer. */
  openHelp: (explainerId?: string) => void;
  closeHelp: () => void;
  helpOpen: boolean;
  startTour: () => void;
  /** Start screen shown instead of the workbench. */
  startOpen: boolean;
  /** Waiting to learn whether a last session exists (default start mode):
   *  neither the start screen nor the workbench is shown yet. */
  startPending: boolean;
  /** The autosave was checked: a last session opens directly, none shows
   *  the start screen. */
  resolveStart: (hasSession: boolean) => void;
  showStart: () => void;
  hideStart: () => void;
}

export const GuideCtx = createContext<GuideApi | null>(null);

/** Null outside a GuideProvider (panels rendered in isolation, layouts). */
export function useGuideOptional(): GuideApi | null {
  return useContext(GuideCtx);
}

export function useGuide(): GuideApi {
  const v = useContext(GuideCtx);
  if (!v) throw new Error("useGuide outside GuideProvider");
  return v;
}

const TOUR_KEY = "opendose-tour-done";
const START_KEY = "opendose-start-screen";

export function tourDone(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === "1"; } catch { return false; }
}
export function setTourDone(): void {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* private mode */ }
}

/** When the start screen shows as the app opens. "auto" (the default):
 *  on the first visit and whenever no autosaved session exists; otherwise
 *  the last session opens directly. "always": every time (the "Show this
 *  screen when OpenDose opens" box ticked). "never": a choice made in
 *  builds before 0.3.0, when the box was ticked by default. */
export type StartMode = "auto" | "always" | "never";

export function startScreenMode(): StartMode {
  try {
    const v = localStorage.getItem(START_KEY);
    return v === "on" ? "always" : v === "off" ? "never" : "auto";
  } catch { return "auto"; }
}

/** The "Show this screen when OpenDose opens" box: ticked = every time. */
export function startScreenEnabled(): boolean {
  return startScreenMode() === "always";
}
/** Ticked: every time. Unticked: the default (first visit, or no session
 *  to reopen). */
export function setStartScreenEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(START_KEY, "on");
    else localStorage.removeItem(START_KEY);
  } catch { /* ignore */ }
}

/** `?example=1` opens the example project directly, without the start
 *  screen or the tour (links, demos and the end-to-end checks use it). */
export function exampleRequested(): boolean {
  if (typeof location === "undefined") return false;
  const v = new URLSearchParams(location.search).get("example");
  return v !== null && v !== "0";
}

/** A share link ("#p=…") opens its project directly: no start screen. */
export function shareLinkRequested(): boolean {
  if (typeof location === "undefined") return false;
  return location.hash.startsWith("#p=");
}
