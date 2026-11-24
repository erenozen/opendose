// The exercise of the shared link on screen (P-126, ./exercise.ts): set
// when the page opens an exercise link, revealed when the student commits
// answers in Help me choose (or makes a copy), ended when another project
// replaces the shared one. Kept in memory only, like the shared project.
import { useSyncExternalStore } from "react";
import type { ChosenTest } from "../guide/choice";
import type { Exercise } from "./exercise";

export interface ExerciseState {
  exercise: Exercise | null;
  /** Real names of the results sheets renamed while the test is withheld. */
  names: Record<string, string>;
  /** The results are shown (the student committed, or made a copy). */
  revealed: boolean;
  /** What the student's answers in Help me choose pointed to. */
  choice: ChosenTest | null;
}

const NONE: ExerciseState = { exercise: null, names: {}, revealed: false, choice: null };
let state: ExerciseState = NONE;
const subs = new Set<() => void>();
const set = (next: ExerciseState) => { state = next; subs.forEach((f) => f()); };

export function startExercise(exercise: Exercise, names: Record<string, string>): void {
  set({ exercise, names, revealed: false, choice: null });
}

/** Show the results, with the student's choice when there is one. */
export function revealExercise(choice: ChosenTest | null = null): void {
  if (!state.exercise || state.revealed) return;
  set({ ...state, revealed: true, choice });
}

export function endExercise(): void {
  if (state !== NONE) set(NONE);
}

export function exerciseState(): ExerciseState { return state; }

/** Results are withheld right now. */
export function exerciseWithheld(s: ExerciseState = state): boolean {
  return !!s.exercise && !s.revealed;
}

/** Which test was run is withheld right now. */
export function testWithheld(s: ExerciseState = state): boolean {
  return exerciseWithheld(s) && !!s.exercise?.hideTest;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function useExercise(): ExerciseState {
  return useSyncExternalStore(subscribe, exerciseState, exerciseState);
}
