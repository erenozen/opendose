// The reason "Help me choose…" gave for the analysis it opened, kept for
// the session so the results sheet it lands on can say why this test
// (components/ResultsLinks). Not saved in the project: the wizard can be
// rerun at any time.
export interface ChosenTest { test: string; reason: string }

const chosen = new Map<string, ChosenTest>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

/** Called when a reason is remembered or dismissed (useSyncExternalStore). */
export function subscribeChoice(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

export function rememberChoice(resultsId: string, c: ChosenTest): void {
  chosen.set(resultsId, c);
  changed();
}

export function choiceFor(resultsId: string): ChosenTest | null {
  return chosen.get(resultsId) ?? null;
}

export function forgetChoice(resultsId: string): void {
  if (chosen.delete(resultsId)) changed();
}
