// "Which test?" wizard: plain-language questions about the design, the
// data checks it can run on the current table, and one recommended test
// with its reason, the alternatives and the post hoc family; then opens
// the analysis pre-configured on the current table, or creates a table of
// the right type when the current one does not fit.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useProject } from "../app/context";
import Modal from "../components/Modal";
import { newId } from "../project/ids";
import { missingInRows, cellChecks } from "./stats";
import type { TableType } from "../project/types";
import { findSheet } from "../project/ops";
import { tableDef } from "../sheets/registry";
import { addConfiguredAnalysis, addTargetTable, dataSheetOf, fitsTable } from "./actions";
import { ExplainerDetails } from "./LearnMore";
import { normalityPs, withNormality } from "./useGroupChecks";
import {
  deriveChecks, recommend, type Alternative, type DataChecks, type Design, type Target,
} from "./recommend";
import { designFromTable, tableWording } from "./tablePrefill";
import { rememberChoice } from "./choice";
import { groupChecks } from "./stats";

function Choice<T extends string>({ legend, value, options, onChange, hint }: {
  legend: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset className="wt-q">
      <legend>{legend}</legend>
      <div className="wt-options">
        {options.map(([v, label]) => (
          <label key={v} className={v === value ? "checked" : ""}>
            <input type="radio" name={name} value={v} checked={v === value}
              onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {hint && <p className="wt-hint">{hint}</p>}
    </fieldset>
  );
}

const YES_NO: ["no" | "yes", string][] = [["no", "No"], ["yes", "Yes"]];

export default function WhichTest({ onClose }: { onClose: () => void }) {
  const { project, selectedId, apply, select, engineReady } = useProject();
  const data = useMemo(() => dataSheetOf(project, selectedId), [project, selectedId]);
  // Pre-filled from the table (groups, layout, replicates) and from the
  // analysis on screen (a paired t test says the rows are matched).
  const [d, setD] = useState<Design>(() => {
    const s = findSheet(project, selectedId);
    return designFromTable(data?.table, s?.kind === "results" ? s.options : undefined);
  });
  const words = useMemo(() => tableWording(data?.table), [data]);
  const set = (patch: Partial<Design>) => setD((x) => ({ ...x, ...patch }));

  // ---- data checks on the current table
  const [ps, setPs] = useState<(number | null)[] | null>(null);
  const table = data?.table ?? null;
  const columnLike = !!table && ["column", "xy", "nested"].includes(table.type)
    && table.subcolumnFormat === "replicates";
  useEffect(() => {
    if (!table || !columnLike || !engineReady) return;
    let live = true;
    void normalityPs(table).then((r) => { if (live) setPs(r); });
    return () => { live = false; };
  }, [table, columnLike, engineReady]);
  const checks: DataChecks | null = useMemo(() => {
    if (!table || table.subcolumnFormat !== "replicates") return null;
    if (table.type === "grouped") {
      const cells = cellChecks(table);
      if (!cells.length) return null;
      return { tableType: "grouped", missing: missingInRows(table).cells > 0,
        groups: cells.map((c) => ({ name: `${c.row} / ${c.dataset}`, n: c.s.n, mean: c.s.mean,
          sd: c.s.sd, normalityP: null, allPositive: (c.s.min ?? 0) > 0 })) };
    }
    if (!columnLike) return null;
    const groups = withNormality(groupChecks(table), ps).filter((g) => g.n > 0);
    if (!groups.length) return null;
    return { tableType: table.type, groups,
      missing: missingInRows(table, table.type !== "nested").cells > 0 };
  }, [table, columnLike, ps]);
  // Checks only describe the design they were computed for.
  const applicable = checks && d.outcome === "continuous" ? checks : null;
  const rec = useMemo(() => recommend(d, applicable), [d, applicable]);
  const k = useMemo(() => deriveChecks(applicable), [applicable]);

  const fits = !!rec.target && fitsTable(data, rec.target);
  const targetType = rec.target ? tableDef(rec.target.tableType as TableType) : null;

  const openTarget = (target: Target | null, test: string, reason: string) => {
    if (!target) return;
    let goTo: string | null = null;
    let resultsId: string | null = null;
    if (fitsTable(data, target) && data) {
      apply((p) => {
        const r = addConfiguredAnalysis(p, data.id, target, newId);
        goTo = r.resultsId;
        resultsId = r.resultsId;
        return r.project;
      });
    } else {
      apply((p) => {
        const r = addTargetTable(p, target, `${test.replace(/ \(.*\)$/, "")} data`, newId);
        goTo = r.resultsId ?? r.dataId;
        resultsId = r.resultsId;
        return r.project;
      });
    }
    if (resultsId) rememberChoice(resultsId, { test, reason });
    onClose();
    if (goTo) select(goTo);
  };
  const open = () => openTarget(rec.target, rec.test, rec.reason);
  /** An alternative OpenDose can open (e.g. Cox regression), as a button. */
  const altButton = (a: Alternative) => {
    if (!a.target) return null;
    const here = fitsTable(data, a.target) && data;
    return (
      <button type="button" className="linkish wt-alt-open"
        onClick={() => openTarget(a.target!, a.test, `${a.test}: ${a.when}.`)}>
        {here ? `Open ${a.test} on “${data.name}”` : `Create a table for ${a.test}`}
      </button>
    );
  };

  const c = d.outcome === "continuous";
  const groupOpts: ["one" | "two" | "three_plus", string][] = [
    ["one", c ? "One (vs a value)" : "One"], ["two", "Two"], ["three_plus", "Three or more"]];

  return (
    <Modal title="Help me choose a test" className="modal-wide which-test" onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!rec.target} onClick={open}>
            {fits && data ? `Open on “${data.name}”`
              : targetType ? `Create a ${targetType.label} table` : "Open"}
          </button>
        </>
      }>
      <p className="modal-text">
        Answer in terms of your experiment; the recommendation updates as you go.
        {words.pairing || words.groupsHint ? " The questions use your own rows and columns." : ""}
        {data ? <> Data checks run on <strong>{data.name}</strong>.</> : null}
      </p>
      <div className="wt-grid">
        <div className="wt-questions">
          <Choice legend="What did you measure?" value={d.outcome}
            options={[["continuous", "A measurement (weight, signal, concentration)"],
              ["counts", "Counts or proportions (yes/no per subject)"],
              ["survival", "Time to an event (survival)"],
              ["curve", "A dose-response or other curve"]]}
            onChange={(v) => set({ outcome: v })} />
          {d.outcome !== "curve" && (
            <Choice legend="How many groups or conditions?" value={d.groups} options={groupOpts}
              onChange={(v) => set({ groups: v })}
              hint={c || d.outcome === "survival" ? words.groupsHint ?? undefined : undefined} />
          )}
          {c && d.groups !== "one" && (
            <Choice legend="How many factors?" value={d.factors}
              options={[["one", "One"], ["two", "Two (e.g. genotype × treatment)"], ["three", "Three"]]}
              onChange={(v) => set({ factors: v })} />
          )}
          {c && d.groups !== "one" && d.factors === "one" && (
            <Choice legend="Was each condition run once per experiment, on different days?"
              value={d.blocked ? "yes" : "no"} options={YES_NO}
              onChange={(v) => set({ blocked: v === "yes" })}
              hint={d.blocked ? "Then each experiment (day) is a block: the analysis is matched "
                + "by experiment, one row per day." : undefined} />
          )}
          {c && d.groups !== "one" && d.factors === "two" ? (
            <Choice legend="Is a factor measured repeatedly on the same subjects?" value={d.repeated}
              options={[["none", "No"], ["one", "One factor (e.g. time)"], ["both", "Both"]]}
              onChange={(v) => set({ repeated: v, paired: v !== "none" })}
              hint={words.repeatedHint ?? undefined} />
          ) : (d.outcome === "continuous" || d.outcome === "counts") && d.groups !== "one"
            && d.factors !== "three" && !(c && d.blocked) ? (
              <Choice legend={c && words.pairing ? words.pairing
                : "Are measurements paired or repeated on the same subject (or matched, e.g. by experiment)?"}
                value={d.paired ? "yes" : "no"} options={YES_NO}
                onChange={(v) => set({ paired: v === "yes" })}
                hint={c && words.pairing ? words.pairingHint ?? undefined : undefined} />
            ) : null}
          {(c || d.outcome === "counts") && (
            <Choice legend={c && words.replicates ? words.replicates : "What is each value?"}
              value={d.replicates}
              options={[["independent", "One independent subject or experiment"],
                ["technical", "A technical replicate within a biological unit"],
                ["cells", "A cell (or well) within an animal or dish"]]}
              onChange={(v) => set({ replicates: v })}
              hint={d.replicates !== "independent" ? "n should be the number of animals, "
                + "cultures or experiments, not measurements." : undefined} />
          )}
          {c && (
            <Choice legend="What do the values look like?" value={d.distribution}
              options={[["unsure", "Not sure"], ["normal", "Roughly Gaussian"],
                ["lognormal", "Skewed, positive (concentrations, titres)"],
                ["not_normal", "Not Gaussian (scores, off-scale values)"]]}
              onChange={(v) => set({ distribution: v })} />
          )}
          {c && !d.paired && !d.blocked && d.groups !== "one" && d.factors === "one"
            && d.replicates === "independent" && (
            <Choice legend="Do you expect the groups to have equal SDs?" value={d.equalSD}
              options={[["unsure", "Not sure"], ["equal", "Yes, by design"], ["unequal", "No"]]}
              onChange={(v) => set({ equalSD: v })}
              hint="Decide from the design or earlier data, not by testing these values." />
          )}
          {c && (d.paired || d.blocked) && d.groups === "two" && d.factors === "one" && (
            <Choice legend="Does the treatment add a constant amount or multiply?"
              value={d.ratioEffect ? "ratio" : "difference"}
              options={[["difference", "Adds (consistent difference)"],
                ["ratio", "Multiplies (consistent fold change)"]]}
              onChange={(v) => set({ ratioEffect: v === "ratio" })} />
          )}
          {c && d.factors === "one" && (
            <label className="wt-check">
              <input type="checkbox" checked={d.normalised}
                onChange={(e) => set({ normalised: e.target.checked })} />
              Values are normalised to a control (control = 1 or 100%)
            </label>
          )}
          {c && d.groups === "one" && !d.normalised && (
            <label className="wt-field">
              <span>Compare with the value</span>
              <input inputMode="decimal" value={d.hypothetical}
                onChange={(e) => set({ hypothetical: e.target.value })} />
            </label>
          )}
          {c && (d.groups === "three_plus" || d.factors !== "one") && (
            <Choice legend="Which comparisons do you need?" value={d.question}
              options={[["all", "All pairs"], ["control", "Each vs a control"],
                ["selected", "A few planned pairs"]]}
              onChange={(v) => set({ question: v })} />
          )}
          {d.outcome === "counts" && d.groups !== "one" && !d.paired && (
            <>
              <Choice legend="How many outcome categories?" value={d.twoOutcomes ? "two" : "more"}
                options={[["two", "Two (yes / no)"], ["more", "Three or more"]]}
                onChange={(v) => set({ twoOutcomes: v === "two" })} />
              {d.groups === "two" && d.twoOutcomes && (
                <Choice legend="Repeated in several strata (sites, experiments)?"
                  value={d.stratified ? "yes" : "no"} options={YES_NO}
                  onChange={(v) => set({ stratified: v === "yes" })} />
              )}
            </>
          )}
          {d.outcome === "counts" && d.groups === "one" && (
            <Choice legend="How many outcome categories?" value={d.twoOutcomes ? "two" : "more"}
              options={[["two", "Two"], ["more", "Three or more"]]}
              onChange={(v) => set({ twoOutcomes: v === "two" })} />
          )}
          {(d.outcome === "counts" || d.outcome === "survival") && d.groups === "three_plus" && (
            <Choice legend="Do the groups have a natural order (doses, ages)?"
              value={d.ordered ? "yes" : "no"} options={YES_NO}
              onChange={(v) => set({ ordered: v === "yes" })} />
          )}
          {d.outcome === "curve" && (
            <>
              <Choice legend="What do you want from the curve?" value={d.curveGoal}
                options={[["ic50", "IC50 / EC50"], ["standard", "Interpolate unknowns (standard curve)"],
                  ["compare", "Compare curves between conditions"], ["other", "Another model"]]}
                onChange={(v) => set({ curveGoal: v })} />
              {(d.curveGoal === "ic50" || d.curveGoal === "compare") && (
                <Choice legend="Does the response fall or rise with dose?"
                  value={d.agonist ? "agonist" : "inhibitor"}
                  options={[["inhibitor", "Falls (inhibitor)"], ["agonist", "Rises (agonist)"]]}
                  onChange={(v) => set({ agonist: v === "agonist" })} />
              )}
              {d.curveGoal === "compare" && (
                <Choice legend="Did each experiment produce its own curve?"
                  value={d.paired ? "yes" : "no"} options={YES_NO}
                  onChange={(v) => set({ paired: v === "yes" })} />
              )}
            </>
          )}
          {d.outcome !== "curve" && (
            <Choice legend="Did you predict the direction of the effect before collecting the data?"
              value={d.direction} options={[["either", "No, either direction"], ["predicted", "Yes"]]}
              onChange={(v) => set({ direction: v })} />
          )}
          {c && !k && (
            <Choice legend="Values per group" value={d.sampleSize}
              options={[["unknown", "Not sure"], ["tiny", "3 or fewer"], ["small", "4–7"],
                ["medium", "8–29"], ["large", "30 or more"]]}
              onChange={(v) => set({ sampleSize: v })} />
          )}
        </div>
        <section className="wt-result" aria-live="polite" aria-label="Recommendation">
          <p className="wt-eyebrow">Recommended</p>
          <h3 className="wt-test">{rec.test}</h3>
          <p>{rec.reason}</p>
          {k && applicable && (
            <div className="wt-checks">
              <h4>Checks on {data?.name}</h4>
              <ul>
                <li>n per group: {applicable.groups.map((g) => g.n).join(", ")}
                  {k.minN !== null && k.minN < 3 ? " (n < 3)" : k.unequalN ? " (unequal)" : ""}</li>
                {applicable.groups.some((g) => g.normalityP !== null) && (
                  <li>Normality (Shapiro-Wilk): {k.nonNormal.length
                    ? `fails for ${k.nonNormal.join(", ")}` : "no group fails"}</li>
                )}
                {k.sdRatio !== null && <li>Largest / smallest SD: {k.sdRatio.toFixed(1)}</li>}
                {k.zeroVariance.length > 0 && <li>SD 0: {k.zeroVariance.join(", ")}</li>}
                {applicable.missing && <li>Some rows have missing values</li>}
              </ul>
            </div>
          )}
          {rec.notes.length > 0 && (
            <ul className="wt-notes">{rec.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
          {rec.postHoc && (
            <p><strong>Comparisons ({rec.postHoc.family}): {rec.postHoc.method}.</strong>{" "}
              {rec.postHoc.why}{rec.postHoc.inOpenDose ? ` ${rec.postHoc.inOpenDose}` : ""}</p>
          )}
          <p className="wt-tails">{rec.tails}</p>
          {rec.alternatives.length > 0 && (
            <>
              <h4>Alternatives</h4>
              <ul className="wt-alts">
                {rec.alternatives.map((a) => (
                  <li key={a.test}><strong>{a.test}</strong> {a.when}.{a.target && " "}
                    {altButton(a)}</li>
                ))}
              </ul>
            </>
          )}
          {rec.target && !fits && (
            <p className="wt-table-note">
              {data ? `“${data.name}” is a ${tableDef(data.table.type).label} table; this test `
                + `needs a ${targetType?.label} table. ` : ""}{rec.target.layout}
            </p>
          )}
          {rec.explainers.map((id) => <ExplainerDetails key={id} id={id} />)}
          <p className="wt-sources">
            Sources: {rec.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && "; "}
                <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
            ))}
          </p>
        </section>
      </div>
    </Modal>
  );
}
