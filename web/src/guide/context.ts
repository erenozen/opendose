// Guidance services (provided by GuideProvider): the "Which test?" wizard,
// the Help panel with explainers, the guided tour and the start screen.
import { createContext, useContext } from "react";

export interface GuideApi {
  openWizard: () => void;
  /** Open the Help panel, optionally at one explainer. */
  openHelp: (explainerId?: string) => void;
  closeHelp: () => void;
  helpOpen: boolean;
  startTour: () => void;
  /** Start screen shown instead of the workbench. */
  startOpen: boolean;
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

/** Show the start screen when the app opens (default yes). */
export function startScreenEnabled(): boolean {
  try { return localStorage.getItem(START_KEY) !== "off"; } catch { return true; }
}
export function setStartScreenEnabled(on: boolean): void {
  try { localStorage.setItem(START_KEY, on ? "on" : "off"); } catch { /* ignore */ }
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
