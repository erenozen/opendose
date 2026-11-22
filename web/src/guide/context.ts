// Guidance services (provided by GuideProvider): the "Which test?" wizard,
// the Help panel with explainers, the guided tour, and whether the app
// is still deciding where to open (the last session or the example).
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
  /** Waiting to learn whether a last session exists: the workbench is not
   *  shown yet (a first visit then lands on the example, DECISIONS 4). */
  startPending: boolean;
  /** The autosave was checked: the workbench shows. */
  resolveStart: () => void;
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

export function tourDone(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === "1"; } catch { return false; }
}
export function setTourDone(): void {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* private mode */ }
}

/** Earlier builds had a start screen and a "Show this screen when
 *  OpenDose opens" box, stored under this key. There is no start screen
 *  now: a first visit lands on the example and a returning one in its last
 *  session, which is what the box unticked did; ticked, it also kept the
 *  last session behind a restore banner instead of reopening it. That
 *  difference was not worth a preference of its own, so the stored choice
 *  is dropped once (DECISIONS 4). */
const OLD_START_KEY = "opendose-start-screen";

export function dropStartScreenPref(): void {
  try { localStorage.removeItem(OLD_START_KEY); } catch { /* private mode */ }
}

/** `?example=1` opens the example project directly, without looking for
 *  the last session (links, demos and the end-to-end checks use it). */
export function exampleRequested(): boolean {
  if (typeof location === "undefined") return false;
  const v = new URLSearchParams(location.search).get("example");
  return v !== null && v !== "0";
}

/** A share link ("#p=…", or "#e=…" protected) opens its project directly,
 *  without looking for the last session. */
export function shareLinkRequested(): boolean {
  if (typeof location === "undefined") return false;
  return location.hash.startsWith("#p=") || location.hash.startsWith("#e=");
}
