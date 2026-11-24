// The student commits answers in Help me choose (or makes a copy): the
// exercise's results are shown (P-126, ./exercise.ts).
import { useCallback } from "react";
import { useProject } from "../app/context";
import type { ChosenTest } from "../guide/choice";
import { unmaskProject } from "./exercise";
import { exerciseState, exerciseWithheld, revealExercise } from "./exerciseStore";

/** Show the results: the analyses get their names back, and the choice
 *  (null: none) is kept for the outcome banner (ExercisePanes.tsx). */
export function useExerciseCommit(): (choice: ChosenTest | null) => void {
  const { store } = useProject();
  return useCallback((choice) => {
    const s = exerciseState();
    if (!exerciseWithheld(s)) return;
    if (Object.keys(s.names).length) store.reset(unmaskProject(store.project, s.names));
    revealExercise(choice);
  }, [store]);
}
