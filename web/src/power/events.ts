// Open the power tool from anywhere without threading props: a window
// event that <PowerHost> (mounted once in App) answers.
import type { PilotData } from "./pilot";

export const POWER_EVENT = "opendose-power";

export interface PowerRequest {
  tab: "power" | "random";
  /** "Plan next experiment" from a results sheet: the pilot's SD, means
   *  and n (./pilot.ts), so the calculation starts from this data. */
  pilot?: PilotData;
}

export function openPowerTool(tab: PowerRequest["tab"] = "power", pilot?: PilotData): void {
  window.dispatchEvent(new CustomEvent<PowerRequest>(POWER_EVENT,
    { detail: pilot ? { tab, pilot } : { tab } }));
}

export function onPowerRequest(fn: (r: PowerRequest) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<PowerRequest>).detail);
  window.addEventListener(POWER_EVENT, h);
  return () => window.removeEventListener(POWER_EVENT, h);
}
