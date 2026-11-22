// "What does each value represent?": the non-blocking question in the
// Checks row of a results sheet whose table looks like it holds
// replicates (rules and project edits in guide/declareUnit.ts). Answered
// or dismissed once per table (DataSheet.report.valueIs).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useProject } from "../app/context";
import { Button, Field, Input, NumberField } from "../components/ui";
import { newId } from "../project/ids";
import type { DataSheet } from "../project/types";
import { openAssignReplicates } from "../report/useReport";
import { addConfiguredAnalysis } from "./actions";
import {
  applyUnitAnswer, defaultBlock, layoutsFor, needsUnitQuestion, previewOf, VALUE_KINDS,
  type AddAnalysis, type Layout, type UnitAnswer, type ValueKind,
} from "./declareUnit";
import { SRC } from "./sources";

const addAnalysis: AddAnalysis = (p, dataId, analysisId, ids) => {
  const data = p.sheets.find((s) => s.id === dataId) as DataSheet | undefined;
  if (!data) return { project: p, resultsId: null };
  return addConfiguredAnalysis(p, dataId,
    { tableType: data.table.type, analysisId, options: {}, layout: "" }, ids);
};

const LAYOUT_LABEL: Record<Layout, (n: number) => string> = {
  "subcolumns": () => "Each subcolumn is one experiment",
  "subcolumn-blocks": (n) => `Every ${n} adjacent subcolumns are one experiment`,
  "row-blocks": (n) => `Every ${n} rows are one experiment`,
};

export default function UnitQuestion({ dataId }: { dataId: string }) {
  const { project, apply, select, readOnly } = useProject();
  const data = project.sheets.find((s) => s.id === dataId) as DataSheet | undefined;
  const [kind, setKind] = useState<ValueKind | null>(null);
  const layouts = useMemo(() => (data?.kind === "data" ? layoutsFor(data.table) : []), [data]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [size, setSize] = useState<string>("");
  const [unit, setUnit] = useState("");
  const titleId = useId();
  const root = useRef<HTMLElement>(null);
  // A step change moves focus to the first control of the new step
  // (GF-03), only when the user moved it with a press.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    root.current?.querySelector<HTMLElement>(
      kind ? ".unit-q-step input, .unit-q-step button" : ".unit-q-options button")?.focus();
  }, [kind]);
  if (readOnly || !data || !needsUnitQuestion(data)) return null;
  const lay = layout ?? layouts[0] ?? "subcolumns";
  const block = Number(size) >= 1 ? Math.floor(Number(size)) : defaultBlock(data.table, lay);
  const answer: UnitAnswer | null = kind ? { kind, layout: lay, size: block,
    unit: unit.trim() || (kind === "cell" ? "cells" : "wells") } : null;
  const repeats = kind === "technical" || kind === "cell";
  const preview = answer && repeats && layouts.length ? previewOf(data.table, answer) : null;

  const commit = (a: UnitAnswer | "dismissed") => {
    let goTo: string | null = null;
    apply((p) => {
      const r = applyUnitAnswer(p, dataId, a, newId, addAnalysis);
      goTo = r.select;
      return r.project;
    }, `report:${dataId}`);
    if (goTo) select(goTo);
  };
  const pick = (k: ValueKind) => {
    if (k === "experiment" || k === "animal") commit({ kind: k });
    else { moved.current = true; setKind(k); }
  };
  const same = preview && preview.values.length && preview.values.every((n) => n === preview.values[0])
    ? preview.values[0] : null;

  return (
    <section className="unit-question" aria-labelledby={titleId} ref={root}>
      <div className="unit-q-head">
        <p id={titleId} className="unit-q-title">What does each value represent?</p>
        <Button size="sm" variant="ghost" onClick={() => commit("dismissed")}>Not now</Button>
      </div>
      {!repeats ? (
        <>
          <div className="unit-q-options">
            {VALUE_KINDS.map((v) => (
              <Button key={v.id} size="sm" onClick={() => pick(v.id)}>
                <span><span className="sr-only">Each value is: </span>{v.label}</span></Button>
            ))}
          </div>
          <p className="unit-q-hint">
            n must count independent units: wells or cells from one experiment are not
            independent, so they are averaged per experiment before a test.{" "}
            <a href={SRC.gpIndependent.url} target="_blank" rel="noreferrer" className="guide-source">
              {SRC.gpIndependent.label}</a>
          </p>
        </>
      ) : (
        <div className="unit-q-step">
          {layouts.length ? (
            <fieldset className="wt-q">
              <legend>Which values come from the same experiment?</legend>
              <div className="wt-options">
                {layouts.map((l) => (
                  <label key={l} className={l === lay ? "checked" : ""}>
                    <input type="radio" name={`${titleId}-layout`} checked={l === lay}
                      onChange={() => { setLayout(l); setSize(""); }} />
                    <span>{LAYOUT_LABEL[l](l === lay ? block : defaultBlock(data.table, l))}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="unit-q-hint">Enter each experiment&apos;s values in its own subcolumn, or
              set up the experiments in Assign replicates.</p>
          )}
          <div className="unit-q-fields">
            {lay !== "subcolumns" && layouts.length > 0 && (
              <NumberField label={`${lay === "row-blocks" ? "Rows" : "Subcolumns"} per experiment`}
                integer min={1} value={size || String(block)} fieldClassName="field-num"
                onValueChange={(v) => setSize(v.replace(/[^0-9]/g, ""))} />
            )}
            <Field label="Each value is one" className="field-num">
              <Input value={unit} placeholder={kind === "cell" ? "cells" : "wells"}
                onChange={(e) => setUnit(e.target.value.slice(0, 60))} />
            </Field>
          </div>
          {/* Always mounted, so a change of the preview is announced. */}
          <p className="unit-q-preview" role="status">
            {preview && (
              <>
                {preview.experiments} independent experiment{preview.experiments === 1 ? "" : "s"}
                {same ? `, ${same} ${answer!.unit} per ${data.table.type === "column" ? "group"
                  : data.table.type === "xy" ? "X value" : "cell"}` : ""}
                {data.table.type === "xy"
                  ? `: the legend counts experiments (n = ${preview.experiments}).`
                  : `: the test then runs on one value per experiment (n = ${preview.experiments}).`}
              </>
            )}
          </p>
          <div className="unit-q-actions">
            <Button size="sm" variant="primary" disabled={!layouts.length || !answer}
              onClick={() => answer && commit(answer)}>Use these experiments</Button>
            <Button size="sm" onClick={() => openAssignReplicates(dataId)}>Assign replicates…</Button>
            <Button size="sm" onClick={() => { moved.current = true; setKind(null); }}>Back</Button>
          </div>
          <p className="unit-q-hint">
            <a href={SRC.lazic2010.url} target="_blank" rel="noreferrer" className="guide-source">
              {SRC.lazic2010.label}</a>{" "}
            <a href={SRC.lord2020.url} target="_blank" rel="noreferrer" className="guide-source">
              {SRC.lord2020.label}</a>
          </p>
        </div>
      )}
    </section>
  );
}
