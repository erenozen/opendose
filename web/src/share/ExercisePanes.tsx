// What a student sees of an exercise link (P-126, ./exercise.ts): the
// task in place of the withheld results, with Help me choose as the way
// on; once the answers are committed, the results come back with a
// banner saying what the answers pointed to and whether that is the
// analysis the link holds (P-32's chooser record).
import { useState } from "react";
import { useProject } from "../app/context";
import { Banner, Button } from "../components/ui";
import { useGuideOptional } from "../guide/context";
import { exerciseOutcome, namesText } from "./exercise";
import { useExercise } from "./exerciseStore";
import "./share.css";

/** In place of the answer, results and methods panes while withheld. */
export function ExerciseWithheld() {
  const ex = useExercise();
  const guide = useGuideOptional();
  if (!ex.exercise) return null;
  return (
    <div className="pane pane-exercise">
      <section className="exercise-card" aria-label="Exercise">
        <h3>Exercise</h3>
        <p className="exercise-task">{ex.exercise.task}</p>
        <p className="exercise-note">
          {ex.exercise.hideTest
            ? "The results, and which test the analysis runs, are withheld. "
            : "The results are withheld. "}
          Answer the questions about this experiment in Help me choose; when you commit your
          answers, the results appear.
        </p>
        {guide && (
          <div className="exercise-actions">
            <Button variant="primary" onClick={guide.openWizard}>Help me choose…</Button>
          </div>
        )}
      </section>
    </div>
  );
}

/** After the reveal: what the student's answers pointed to. */
export function ExerciseOutcomeBanner() {
  const ex = useExercise();
  const { project } = useProject();
  const [hidden, setHidden] = useState(false);
  const choice = ex.revealed ? ex.choice : null;
  if (!ex.exercise || !choice) return null;
  const out = exerciseOutcome(project, {}, choice);
  const pointed = choice.analysis ? choice.test : `${choice.test} (not an analysis OpenDose runs)`;
  return (
    <Banner tone="info" className="exercise-outcome" open={!hidden} announce
      onDismiss={() => setHidden(true)} dismissLabel="Dismiss the exercise outcome">
      <Banner.Title>Your answers point to: {pointed}.</Banner.Title>
      <Banner.Detail>
        {out.matching.length
          ? `That is the analysis this link holds (${namesText(out.matching)}). `
          : `This link holds ${namesText(out.analyses) || "no analysis"}: compare its settings and methods with your answers. `}
        {choice.reason}
      </Banner.Detail>
    </Banner>
  );
}
