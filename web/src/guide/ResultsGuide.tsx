// Guidance around a results sheet: the "What does each value represent?"
// question, plain-language banners and the assumption checklist chips
// above the results, the "Why your number may differ" note below them.
// Everything is advice; nothing blocks. (A P value withheld at one value
// per group is the analysis' own result: sheets/common/withheld.ts.)
import { useId, useMemo, useState } from "react";
import { useProject } from "../app/context";
import type { DataTableModel, TableType } from "../project/types";
import { openPowerTool } from "../power/events";
import { resultBanners, type Banner } from "./banners";
import { resultChips, type Chip, type ResultContext } from "./checks";
import { differNotes } from "./differ";
import LearnMore from "./LearnMore";
import MultiplicityActions from "./MultiplicityActions";
import { multiplicityFacts, type MultiplicityFacts } from "./multiplicity";
import { openAssignReplicates } from "../report/useReport";
import type { Source } from "./sources";
import UnitQuestion from "./UnitQuestion";
import { useGroupChecks } from "./useGroupChecks";
import { useSmallN } from "./useSmallN";

interface Props {
  analysisId: string;
  tableType: TableType;
  table: DataTableModel;
  options: unknown;
  result: unknown;
  /** The data sheet, for one-click fixes (absent or read-only: none). */
  dataId?: string;
  /** The results sheet shown (for the count of t tests on its table). */
  resultsId?: string;
  readOnly?: boolean;
}

function useContextFor(p: Props, extra: Partial<ResultContext> = {}): ResultContext | null {
  // Normality per group only matters to the column analyses' chips.
  const groups = useGroupChecks(p.table, !!p.result && p.analysisId === "column");
  const { sensitivity, needed, multiplicity } = extra;
  return useMemo(() => (p.result && typeof p.result === "object" ? {
    tableType: p.tableType, analysisId: p.analysisId, table: p.table, groups,
    options: (p.options && typeof p.options === "object" ? p.options : {}) as Record<string, unknown>,
    result: p.result as Record<string, unknown>,
    sensitivity, needed, multiplicity,
  } : null), [p.tableType, p.analysisId, p.table, p.options, p.result, groups,
    sensitivity, needed, multiplicity]);
}

const ICON: Record<Chip["state"], string> = { ok: "✓", warn: "!", bad: "×", info: "i" };

function Sources({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <p className="guide-chip-sources">
      {sources.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="guide-source">
          {s.label}</a>
      ))}
    </p>
  );
}

function Chips({ chips, dataId, multiplicity }: {
  chips: Chip[]; dataId?: string; multiplicity: MultiplicityFacts | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const detailId = useId();
  const cur = chips.find((c) => c.id === open);
  return (
    <div className="guide-chips-wrap">
      <ul className="guide-chips" aria-label="Assumption checklist">
        {chips.map((c) => (
          <li key={c.id}>
            <button type="button" className={`guide-chip chip-${c.state}`}
              aria-expanded={open === c.id} aria-controls={detailId}
              onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="chip-icon" aria-hidden="true">{ICON[c.state]}</span>
              <span className="sr-only">{c.state === "ok" ? "OK: " : c.state === "info" ? "Note: "
                : "Check: "}</span>
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      {cur && (
        <div id={detailId} className={`guide-chip-detail chip-${cur.state}`} role="region"
          aria-label={cur.label}>
          <p>{cur.detail}</p>
          {cur.action === "assign-replicates" && dataId && (
            <p className="guide-chip-action">
              <button type="button" onClick={() => openAssignReplicates(dataId)}>
                Assign replicates…</button>
            </p>
          )}
          {cur.action === "open-power" && (
            <p className="guide-chip-action">
              <button type="button" onClick={() => openPowerTool("power")}>
                Plan replication with the power tool…</button>
            </p>
          )}
          {cur.action === "multiplicity" && multiplicity && <MultiplicityActions facts={multiplicity} />}
          <Sources sources={cur.sources} />
          {cur.explainer && <LearnMore id={cur.explainer} />}
        </div>
      )}
    </div>
  );
}

function BannerView({ b }: { b: Banner }) {
  return (
    <div className={`guide-banner banner-${b.tone}`} role="note" data-banner={b.id}>
      <p className="guide-banner-title">{b.title}</p>
      <p>{b.body}</p>
      {b.fixes.length > 0 && (
        <>
          <p className="guide-banner-sub">What to try</p>
          <ul>{b.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </>
      )}
      <p className="guide-banner-foot">
        {b.action === "open-power" && (
          <button type="button" onClick={() => openPowerTool("power")}>
            Plan replication with the power tool…</button>
        )}
        {b.explainer && <LearnMore id={b.explainer} />}
        {b.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="guide-source">
            {s.label}</a>
        ))}
      </p>
    </div>
  );
}

/** The question, banners and chips, shown above the results. */
export function ResultsGuide(p: Props) {
  const { project } = useProject();
  const { sensitivity, needed } = useSmallN(p.result);
  const multiplicity = useMemo(() => {
    if (!p.dataId || !p.resultsId || p.analysisId !== "column") return null;
    const f = multiplicityFacts(project, p.dataId);
    return f && f.runs.some((t) => t.sheetId === p.resultsId) ? f : null;
  }, [project, p.dataId, p.resultsId, p.analysisId]);
  const ctx = useContextFor(p, { sensitivity, needed, multiplicity });
  const banners = useMemo(() => (ctx ? resultBanners(ctx) : []), [ctx]);
  const chips = useMemo(() => (ctx ? resultChips(ctx) : []), [ctx]);
  const question = p.dataId && !p.readOnly ? <UnitQuestion dataId={p.dataId} /> : null;
  if (!banners.length && !chips.length) {
    return question ? <div className="results-guide">{question}</div> : null;
  }
  return (
    <div className="results-guide">
      {question}
      {banners.map((b) => <BannerView key={b.id} b={b} />)}
      {chips.length > 0 && <Chips chips={chips} dataId={p.readOnly ? undefined : p.dataId}
        multiplicity={p.readOnly ? null : multiplicity} />}
    </div>
  );
}

/** "Why your number may differ", collapsed, under the results. */
export function DifferNote(p: Props) {
  const ctx = useContextFor(p);
  const items = useMemo(() => (ctx ? differNotes(ctx) : []), [ctx]);
  if (!items.length) return null;
  return (
    <details className="guide-differ">
      <summary>Why your number may differ from another program</summary>
      <dl>
        {items.map((it) => (
          <div key={it.topic} className="guide-differ-row">
            <dt>{it.topic}</dt>
            <dd>
              <span>{it.used}</span>
              {it.elsewhere && <span className="guide-differ-else">{it.elsewhere}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <LearnMore id="why-differ" />
    </details>
  );
}
