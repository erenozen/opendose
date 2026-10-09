// The reason "Help me choose…" gave for the analysis it opened, kept for
// the session so the results sheet it lands on can say why this test
// (components/ResultsLinks). Not saved in the project: the wizard can be
// rerun at any time.
export interface ChosenTest { test: string; reason: string }

const chosen = new Map<string, ChosenTest>();

export function rememberChoice(resultsId: string, c: ChosenTest): void {
  chosen.set(resultsId, c);
}

export function choiceFor(resultsId: string): ChosenTest | null {
  return chosen.get(resultsId) ?? null;
}

export function forgetChoice(resultsId: string): void {
  chosen.delete(resultsId);
}
