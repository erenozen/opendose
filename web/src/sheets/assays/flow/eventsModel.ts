// Flow cytometry event counts (FEATURE-PLAN P-50): the engine payload
// (api.py flow_events: Roederer 2008 Poisson counts, the Wilson CI of a
// gated percentage) and the request that opens the calculator from the
// command palette or the flow wizard. Pure, unit-tested.

export interface EventFields {
  /** Target CV of the positive count, % (as typed). */
  cv: string;
  /** Expected frequency of the population, % of the parent (as typed). */
  frequency: string;
  /** Observed positive events and events in the parent gate (as typed). */
  positive: string;
  total: string;
  ciLevel: number;
}

export const DEFAULT_EVENT_FIELDS: EventFields = { cv: "10", frequency: "0.1", positive: "", total: "", ciLevel: 0.95 };

const parse = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** The flow_events payload; a part is sent when any of its fields holds a
 *  number, so the engine says what the other one needs. */
export function eventsPayload(f: EventFields): { analysis: "flow_events"; data: Record<string, number | string>; options: { ci_level: number } } {
  const data: Record<string, number | string> = {};
  const cv = parse(f.cv);
  const fr = parse(f.frequency);
  if (cv !== null || fr !== null) {
    if (cv !== null) data.target_cv = cv;
    if (fr !== null) data.frequency = fr;
  }
  const k = parse(f.positive);
  const n = parse(f.total);
  if (k !== null || n !== null) {
    if (k !== null) data.positive = k;
    if (n !== null) data.total = n;
  }
  return { analysis: "flow_events", data, options: { ci_level: f.ciLevel } };
}

/** Whole numbers with thin grouping as results show counts: 100,000. */
export function count(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "";
}

// ------------------------------------------------------------ opening it

const EVENT = "opendose-flow-events";

export function openFlowEvents(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onFlowEventsRequest(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
