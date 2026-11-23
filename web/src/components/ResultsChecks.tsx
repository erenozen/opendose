// The Checks row of a results headline (DECISIONS 3): one line of status
// icons with counts (passed, to check, notes, open questions) that
// discloses all the guidance about the result: the unit question, why
// this test, the notes and assumption chips, the residual plots of a fit
// or an ANOVA model (residualSets.ts), the plan check, how the
// analysis is validated and planning the next experiment. The most
// severe note is the pane's one tinted callout, outside the disclosure.
import { useMemo, useState, type ReactNode } from "react";
import type { DataSheet, ResultsSheet } from "../project/types";
import { Chips, GuideNote } from "../guide/ResultsGuide";
import UnitQuestion from "../guide/UnitQuestion";
import PlanCheck from "./PlanCheck";
import type { useChecks } from "./useChecks";
import ResultsLinks from "./ResultsLinks";
import ResidualsSection from "../sheets/column/residualsPanel";
import { residualSets } from "./residualSets";
import { ToneIcon } from "./ui/feedbackIcons";

// The disclosure stays as the user left it while they move between
// sheets in this session.
let openNow = false;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function ResultsChecks({ sheet, data, result, options, readOnly, checks }: {
  sheet: ResultsSheet; data: DataSheet; result: unknown; options: unknown; readOnly: boolean;
  checks: ReturnType<typeof useChecks>;
}) {
  const [open, setOpenState] = useState(openNow);
  const setOpen = (o: boolean) => { openNow = o; setOpenState(o); };
  const { guidance: g, callout, counts } = checks;
  const parts: { tone: "success" | "warn" | "info"; n: number; spoken: string }[] = [
    { tone: "success", n: counts.ok, spoken: plural(counts.ok, "passed", "passed") },
    { tone: "warn", n: counts.warn, spoken: plural(counts.warn, "to check", "to check") },
    { tone: "info", n: counts.info, spoken: plural(counts.info, "note", "notes") },
  ];
  const shown = parts.filter((p) => p.n > 0);
  const notes = g.banners.filter((b) => b !== callout);
  const residuals = useMemo(() => residualSets(result), [result]);
  // Inside a <details>: mounted while closed, so its state (an open
  // chip, a half-answered question) survives closing and opening it,
  // and find-in-page still reaches its words.
  const body: ReactNode = (
    <>
      {g.question && <UnitQuestion dataId={data.id} />}
      {notes.map((b) => <GuideNote key={b.id} b={b} />)}
      {g.chips.length > 0 && <Chips chips={g.chips} dataId={readOnly ? undefined : data.id}
        multiplicity={readOnly ? null : g.multiplicity} readOnly={readOnly} />}
      {residuals.map((r) => <ResidualsSection key={r.key} data={r.data} title={r.title} />)}
      <PlanCheck key={`plan-${sheet.id}`} sheet={sheet} data={data} readOnly={readOnly} />
      <ResultsLinks key={sheet.id} sheet={sheet} tableName={data.name} options={options}
        result={result} />
    </>
  );
  return (
    <>
      <details className="checks" open={open}
        onToggle={(e) => { if (e.currentTarget.open !== open) setOpen(e.currentTarget.open); }}>
        <summary className="checks-toggle">
        <span className="checks-label">Checks</span>
        {shown.map((p) => (
          <span key={p.tone} className="checks-count" data-tone={p.tone}>
            <ToneIcon tone={p.tone} />
            <span aria-hidden="true">{p.n}</span>
            <span className="sr-only">{p.spoken}</span>
          </span>
        ))}
        {counts.questions > 0 && (
          <span className="checks-count" data-tone="question">
            {plural(counts.questions, "open question", "open questions")}
          </span>
        )}
        {!shown.length && !counts.questions && (
          <span className="checks-none">nothing flagged</span>
        )}
        </summary>
        <div className="checks-body">{body}</div>
      </details>
      {callout && <GuideNote b={callout} callout />}
    </>
  );
}
