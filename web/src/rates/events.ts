// Open "Compare two event rates" from anywhere (the Analyze menu, File >
// Tools, the command palette): a window event that <RatesHost> (mounted
// once in App) answers, as power/events.ts.
export const RATES_EVENT = "opendose-rates";

export function openRatesTool(): void {
  window.dispatchEvent(new CustomEvent(RATES_EVENT));
}

export function onRatesRequest(fn: () => void): () => void {
  window.addEventListener(RATES_EVENT, fn);
  return () => window.removeEventListener(RATES_EVENT, fn);
}
