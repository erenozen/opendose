// Competing risks (P-90): the results sheet (names of the kinds of event,
// counts, Gray's test, cumulative incidence at a chosen time, the
// cumulative incidence table of each kind and group), the methods text
// and the cumulative incidence graph. Wording and options in
// competing.ts; every number comes from the engine.
import { useEffect, useMemo, useState } from "react";
import { SurvivalPlot } from "../../components/SurvivalView";
import { OptCheck, OptNote, OptSelect } from "../../components/GraphOptionControls";
import { Field, Input } from "../../components/ui";
import { softwareSentence } from "../../export/cite";
import { riskSetsFromTable } from "../../graph";
import { getRuntimeVersions } from "../../lib/engine";
import { tableP } from "../../report/pformat";
import { formatSig } from "../../types";
import { Grid, Note } from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import TableCopy from "../common/TableCopy";
import { useGraphSetting } from "../grouped/plotting";
import type { GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import {
  causeLabel, COMPETING_AUTO_Y, competingMethodsText, competingTimeLabel, competingWarnings, competingYTitle,
  graphCause, lastCommonFollowUp, normalizeCompetingGraph, normalizeCompetingOptions, plotCurves,
  type CompetingCi, type CompetingGraphSettings, type CompetingOptions,
} from "./competing";
import { fmtTime } from "./entry";
import { Cite, CommitNumber, Method } from "./extrasPanels";
import { useOptionSetter } from "./useOptionSetter";
import "./survival.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const f = (v: unknown) => (num(v) ? formatSig(v) : "n/a");
const raw = (v: unknown) => (num(v) ? String(v) : "");
const ciText = (lo: unknown, hi: unknown) => (num(lo) && num(hi) ? `${formatSig(lo)} to ${formatSig(hi)}` : "n/a");

/** A name field that commits when it loses focus or on Enter. */
function NameField({ code, value, disabled, onCommit }: {
  code: number; value: string; disabled: boolean; onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const commit = () => { if (text.trim() !== value) onCommit(text.trim()); };
  return (
    <Field label={`Name of event code ${code}`}>
      <Input value={text} disabled={disabled} placeholder={`Cause ${code}`}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
    </Field>
  );
}

export function CompetingResults({ sheet, table, options, result }: ResultsProps<unknown, R>) {
  const set = useOptionSetter<CompetingOptions>(sheet);
  const o = normalizeCompetingOptions(options);
  if (!result) return null;
  if (result.error) {
    return <div className="results-error">
      Competing risks analysis failed: {String(result.error)}. Each dataset needs two subcolumns:
      time (Y1) and event code (Y2: 0 = censored, 1, 2, … one code per kind of event).
    </div>;
  }
  const causes = (result.causes ?? []) as R[];
  const names = (result.group_names ?? []) as string[];
  const label = (code: number) => causeLabel(code, o.causeLabels);
  const level = `${Math.round(100 * (num(result.ci_level) ? result.ci_level : 0.95))}%`;
  const first = causes[0]?.groups as R[] | undefined;
  const t = result.at_time_used as number | null | undefined;
  const def = lastCommonFollowUp(table);
  const warnings = competingWarnings(result);
  const tested = causes.filter((c) => c.gray);
  return (
    <div className="result-card">
      <h3>Competing risks: cumulative incidence</h3>
      <div className="surv-controls" role="group" aria-label="Names of the kinds of event">
        {causes.map((c) => (
          <NameField key={c.code} code={c.code} value={o.causeLabels[String(c.code)] ?? ""}
            disabled={!set}
            onCommit={(v) => set?.({ causeLabels: { ...o.causeLabels, [String(c.code)]: v } })} />
        ))}
      </div>
      <Grid caption="Subjects and events per group"
        head={["Group", "n", ...causes.map((c) => `${label(c.code)} (code ${c.code})`), "Censored",
          "Last follow-up"]}
        rows={(first ?? []).map((g, gi) => [
          String(g.name), String(g.n), ...causes.map((c) => String(c.groups[gi]?.events ?? 0)),
          String(g.censored), fmtTime(g.last_time),
        ])} />
      {warnings.length > 0 && (
        <div className="surv-notes">
          {warnings.map((w) => <Note key={w} warn><span role="note">{w}</span></Note>)}
        </div>
      )}
      {tested.length > 0 && (
        <section className="surv-block" aria-label="Gray's test">
          <h4>Gray&apos;s test: does the cumulative incidence differ between {names.join(", ")}?</h4>
          <TableCopy name="Gray's test" matrix={() => [["Kind of event", "Code", "Chi-square", "df", "P"],
            ...tested.map((c) => [label(c.code), String(c.code), raw(c.gray.chi2), String(c.gray.df), raw(c.gray.p)])]} />
          <Grid caption="Gray's test per kind of event" head={["Kind of event", "χ²", "df", "P value"]}
            rows={tested.map((c) => [label(c.code), f(c.gray.chi2), String(c.gray.df),
              c.gray.p === null ? "not computed" : tableP(c.gray.p)])} />
          {tested.filter((c) => c.note).map((c) => (
            <p key={c.code} className="hint-block">{label(c.code)}: {String(c.note)}</p>
          ))}
          <Method>
            Gray&apos;s test compares the cumulative incidence of one kind of event between groups,
            treating the other kinds as competing, not as censoring (weight ρ = 0, χ² on{" "}
            {names.length - 1} df). A difference in one kind of event can come from a difference in
            the other: read the curves of every kind together.{" "}
            <Cite>Gray 1988, A class of K-sample tests for comparing the cumulative incidence of a
              competing risk, Ann Stat 16:1141</Cite>.
          </Method>
        </section>
      )}
      {t != null && (
        <section className="surv-block" aria-label="Cumulative incidence at a chosen time">
          <h4>Cumulative incidence at {competingTimeLabel(t, table)}</h4>
          <div className="surv-controls">
            <CommitNumber label="Cumulative incidence at time" value={o.atTime} disabled={!set}
              placeholder={def === null ? "" : fmtTime(def)}
              onCommit={(atTime) => set?.({ atTime })}
              note={result.at_time_default && def !== null
                ? `Default: ${competingTimeLabel(def, table)}, the last time every group was still followed.`
                : undefined} />
          </div>
          <TableCopy name={`Cumulative incidence at ${competingTimeLabel(t, table)}`} matrix={() => [
            ["Group", "Kind of event", "Time", "Cumulative incidence", "SE", `Lower ${level} CI`, `Upper ${level} CI`],
            ...causes.flatMap((c) => (c.groups as R[]).map((g) => {
              const a = g.at_times?.[0] as R | undefined;
              return [String(g.name), label(c.code), raw(t), raw(a?.cif), raw(a?.se), raw(a?.lower), raw(a?.upper)];
            }))]} />
          <Grid caption={`Cumulative incidence at ${competingTimeLabel(t, table)}`}
            head={["Group", "Kind of event", "Cumulative incidence", `${level} CI (log-log)`, "SE"]}
            rows={causes.flatMap((c) => (c.groups as R[]).map((g) => {
              const a = g.at_times?.[0] as R | undefined;
              return [String(g.name), label(c.code), a?.beyond_last ? "not estimated" : f(a?.cif),
                a?.beyond_last ? "n/a" : ciText(a?.lower, a?.upper), a?.beyond_last ? "n/a" : f(a?.se)];
            }))} />
          {(first ?? []).filter((g) => g.at_times?.[0]?.beyond_last).map((g) => (
            <p key={g.name} className="hint-block">
              {g.name}: {competingTimeLabel(t, table)} is after its last follow-up
              ({fmtTime(g.last_time)}), so nothing is estimated there.
            </p>
          ))}
        </section>
      )}
      {causes.map((c) => (c.groups as R[]).map((g) => (
        <div className="km-table" key={`${c.code}-${g.name}`}>
          <h4>Cumulative incidence of {label(c.code)}: {g.name}</h4>
          {g.steps.length === 0 ? <p className="hint-block">No {label(c.code)} events in {g.name}: the cumulative
            incidence stays at 0.</p> : (
            <>
              <TableCopy name={`Cumulative incidence ${label(c.code)} ${g.name}`} matrix={() => [
                ["Time", "At risk", "Events", "Other kinds of event", "Censored", "Cumulative incidence", "SE",
                  `Lower ${level} CI`, `Upper ${level} CI`],
                ...(g.steps as R[]).map((s) => [raw(s.time), String(s.at_risk), String(s.events),
                  String(s.competing), String(s.censored), raw(s.cif), raw(s.se), raw(s.lower), raw(s.upper)])]} />
              <Grid caption={`Cumulative incidence of ${label(c.code)} in ${g.name}`}
                head={["Time", "At risk", "Events", "Other kinds", "Censored", "Cumulative incidence", "SE",
                  `${level} CI (log-log)`]}
                rows={(g.steps as R[]).map((s) => [f(s.time), String(s.at_risk), String(s.events),
                  String(s.competing), String(s.censored), f(s.cif), f(s.se), ciText(s.lower, s.upper)])} />
            </>
          )}
        </div>
      )))}
      <Method>
        One row per time with an event of this kind: at risk counts the subjects still free of every
        kind of event just before the time; other kinds and censored count what happened at the same
        time. The cumulative incidence is the Aalen-Johansen estimate, the probability of having had
        this kind of event by that time when the other kinds can come first; it is never 1 − Kaplan-Meier,
        which overstates it (<Cite>Putter, Fiocco &amp; Geskus 2007, Tutorial in biostatistics:
          competing risks and multi-state models, Stat Med 26:2389</Cite>). Standard errors by the
        delta method and {level} CIs on the log(-log) scale, as R&apos;s cmprsk.
      </Method>
    </div>
  );
}

export function CompetingMethods({ result, table }: ResultsProps<unknown, R>) {
  return <CopyableMethods text={competingMethodsText(result, table, softwareSentence(getRuntimeVersions()))} />;
}



export function CompetingGraph({ graph, result, titles, scheme, table, format, onFormatChange }:
  PlotProps<unknown, R>) {
  const s = useMemo(() => normalizeCompetingGraph(graph.settings.competing), [graph.settings.competing]);
  const cause = graphCause(result, s);
  const riskSets = useMemo(() => riskSetsFromTable(table.datasets), [table.datasets]);
  const plotted = useMemo(() => (result?.error ? result : cause ? { curves: plotCurves(cause) } : null),
    [result, cause]);
  const label = cause ? causeLabel(cause.code, result?.cause_labels) : "";
  const yTitle = titles.y === COMPETING_AUTO_Y ? competingYTitle(label, s.scale) : titles.y;
  return <SurvivalPlot result={plotted} scheme={scheme} xTitle={titles.x} yTitle={yTitle}
    format={format} onFormatChange={onFormatChange} riskSets={riskSets.length ? riskSets : undefined}
    censorMarks={s.censorMarks} ci={s.ci} show="death" scale={s.scale} />;
}

export function CompetingGraphOptions({ graph, result }: GraphOptionsProps<unknown, R>) {
  const [s, set] = useGraphSetting(graph, "competing", normalizeCompetingGraph);
  if (!set) return null;
  const causes = (Array.isArray(result?.causes) ? result!.causes : []) as R[];
  const current = graphCause(result, s);
  const put = (p: Partial<CompetingGraphSettings>) => set({ ...s, ...p });
  return (
    <>
      {causes.length > 0 && (
        <OptSelect label="Kind of event" value={String(current?.code ?? causes[0].code)}
          options={causes.map((c) => [String(c.code), causeLabel(c.code, result?.cause_labels)] as const)}
          onChange={(v) => put({ cause: Number(v) })} />
      )}
      <OptSelect label="Y axis" value={s.scale}
        options={[["percent", "Percent (0 to 100)"], ["fraction", "Fraction (0 to 1)"]] as const}
        onChange={(scale) => put({ scale: scale as CompetingGraphSettings["scale"] })} />
      <OptSelect label="95% confidence interval" value={s.ci}
        options={[["none", "Not shown"], ["band", "Shaded band"], ["lines", "Dotted lines"]] as const}
        onChange={(ci) => put({ ci: ci as CompetingCi })} />
      <OptCheck label="Mark censored subjects (ticks)" checked={s.censorMarks}
        onChange={(censorMarks) => put({ censorMarks })} />
      <OptNote>One graph per kind of event: each curve is a group&apos;s cumulative incidence
        (Aalen-Johansen), with the other kinds as competing events. Make a second graph for
        another kind.</OptNote>
    </>
  );
}
