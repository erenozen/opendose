// The study design record on an info sheet (P-61, project/studyDesign.ts):
// randomisation (method and seed), who knew the allocation at each stage,
// the inclusion and exclusion criteria, and the animals. The methods text
// states it and the ARRIVE 2.0 checklist ticks items 4, 5 and 8 from it.
import { useId } from "react";
import { useProject } from "../app/context";
import { SRC } from "../guide/sources";
import { openPowerTool } from "../power/events";
import {
  BLINDING_STAGES, designMethodsSentence, setDesign, type Blinded, type BlindingStage, type Sex,
  type StudyDesign,
} from "../project/studyDesign";
import type { InfoSheet } from "../project/types";
import "./planCheck.css";
import { Field, Input, Textarea } from "./ui";

const SEX_CHOICES: [Sex, string][] = [["female", "Female"], ["male", "Male"], ["both", "Female and male"]];

export default function StudyDesignView({ sheet }: { sheet: InfoSheet & { design: StudyDesign } }) {
  const { project, apply } = useProject();
  const d = sheet.design;
  const ro = !!sheet.frozen;
  const name = useId();
  const change = (patch: Partial<StudyDesign>, key: string | null = null) =>
    apply((p) => setDesign(p, sheet.id, { ...d, ...patch }), key && `design:${sheet.id}:${key}`);
  const blind = (stage: BlindingStage, v: Blinded) => change({ blinding: { ...d.blinding, [stage]: v } });
  const data = project.sheets.find((s) => s.id === sheet.parentId);
  const methods = designMethodsSentence(d);

  return (
    <section className="result-card design-sheet" aria-labelledby="design-h">
      <h3 id="design-h">Study design</h3>
      <p className="hint-block">
        Recorded {data ? <>for “{data.name}”</> : "for the whole project"}. The methods text
        states it, and the ARRIVE 2.0 checklist reads items 4 (randomisation), 5 (blinding)
        and 8 (animals) from it.
      </p>
      <div className="plan-fields">
        <fieldset className="field-radios">
          <legend>How units were allocated to groups</legend>
          <label><input type="radio" name={`${name}-rand`} checked={d.randomised === "yes"} disabled={ro}
            onChange={() => change({ randomised: "yes" })} /> At random</label>
          <label><input type="radio" name={`${name}-rand`} checked={d.randomised === "no"} disabled={ro}
            onChange={() => change({ randomised: "no" })} /> Not at random</label>
        </fieldset>
        <Field label={d.randomised === "no" ? "How units were allocated instead" : "Randomisation method"}>
          <Input value={d.randomisationMethod} readOnly={ro} autoComplete="off"
            placeholder={d.randomised === "no" ? "e.g. by litter, in order of arrival"
              : "e.g. block randomisation (blocks of 4), stratified by sex"}
            onChange={(e) => change({ randomisationMethod: e.target.value }, "method")} /></Field>
        {d.randomised !== "no" && (
          <Field label="Seed">
            <Input value={d.seed} readOnly={ro} autoComplete="off" spellCheck={false}
              placeholder="e.g. 20261123"
              onChange={(e) => change({ seed: e.target.value.slice(0, 60) }, "seed")} /></Field>
        )}
      </div>
      {!ro && d.randomised !== "no" && (
        <p className="plan-strip">
          <button type="button" data-still className="linkish" onClick={() => openPowerTool("random")}>
            Make a randomisation list…</button>{" "}
          <span>its method and seed go here.</span>
        </p>
      )}
      <h4>Blinding: who knew the group allocation</h4>
      <div className="design-blinding">
        {BLINDING_STAGES.map((s) => (
          <fieldset key={s.id} className="field-radios">
            <legend>{s.label}</legend>
            <label><input type="radio" name={`${name}-${s.id}`} checked={d.blinding[s.id] === "blinded"}
              disabled={ro} onChange={() => blind(s.id, "blinded")} /> Blinded</label>
            <label><input type="radio" name={`${name}-${s.id}`} checked={d.blinding[s.id] === "aware"}
              disabled={ro} onChange={() => blind(s.id, "aware")} /> Not blinded</label>
          </fieldset>
        ))}
      </div>
      <div className="plan-fields">
        <Field label="Inclusion and exclusion criteria" className="plan-wide"
          description="For animals and for data points; say whether they were set before the study.">
          <Textarea rows={2} value={d.exclusionCriteria} readOnly={ro}
            placeholder="e.g. set before the study: animals reaching the humane endpoint before day 21 are excluded"
            onChange={(e) => change({ exclusionCriteria: e.target.value }, "criteria")} /></Field>
      </div>
      <h4>Animals</h4>
      <div className="plan-fields">
        <fieldset className="field-radios">
          <legend>Sex</legend>
          {SEX_CHOICES.map(([v, label]) => (
            <label key={v}><input type="radio" name={`${name}-sex`} checked={d.sex === v} disabled={ro}
              onChange={() => change({ sex: v })} /> {label}</label>
          ))}
        </fieldset>
        <Field label="Species and strain">
          <Input value={d.strain} readOnly={ro} placeholder="e.g. C57BL/6J mice"
            onChange={(e) => change({ strain: e.target.value }, "strain")} /></Field>
        <Field label="Age">
          <Input value={d.age} readOnly={ro} placeholder="e.g. 8 to 10 weeks"
            onChange={(e) => change({ age: e.target.value }, "age")} /></Field>
      </div>
      <h4>In the methods text</h4>
      <p className="plan-methods">{methods ?? "Nothing recorded yet."}</p>
      <p className="plan-sources">
        {[SRC.arriveRandomisation, SRC.arriveBlinding, SRC.arriveCriteria, SRC.arriveAnimals, SRC.arrive2020]
          .map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}
      </p>
    </section>
  );
}
