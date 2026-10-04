// Open the power tool from anywhere without threading props: a window
// event that <PowerHost> (mounted once in App) answers.
export const POWER_EVENT = "opendose-power";

export interface PowerRequest { tab: "power" | "random" }

export function openPowerTool(tab: PowerRequest["tab"] = "power"): void {
  window.dispatchEvent(new CustomEvent<PowerRequest>(POWER_EVENT, { detail: { tab } }));
}

export function onPowerRequest(fn: (r: PowerRequest) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<PowerRequest>).detail);
  window.addEventListener(POWER_EVENT, h);
  return () => window.removeEventListener(POWER_EVENT, h);
}
