// Guidance around a results sheet: plain-language banners and the
// assumption checklist chips above the results, the "Why your number may
// differ" note below them. Everything is advice; nothing blocks.
import { useId, useMemo, useState } from "react";
import type { DataTableModel, TableType } from "../project/types";
import { resultBanners, type Banner } from "./banners";
import { resultChips, type Chip, type ResultContext } from "./checks";
import { differNotes } from "./differ";
import LearnMore from "./LearnMore";
import { openAssignReplicates } from "../report/useReport";
import { useGroupChecks } from "./useGroupChecks";

interface Props {
  analysisId: string;
  tableType: TableType;
  table: DataTableModel;
  options: unknown;
  result: unknown;
  /** The data sheet, for one-click fixes (absent or read-only: none). */
  dataId?: string;
  readOnly?: boolean;
}

function useContextFor(p: Props): ResultContext | null {
  // Normality per group only matters to the column analyses' chips.
  const groups = useGroupChecks(p.table, !!p.result && p.analysisId === "column");
  return useMemo(() => (p.result && typeof p.result === "object" ? {
    tableType: p.tableType, analysisId: p.analysisId, table: p.table, groups,
    options: (p.options && typeof p.options === "object" ? p.options : {}) as Record<string, unknown>,
    result: p.result as Record<string, unknown>,
  } : null), [p.tableType, p.analysisId, p.table, p.options, p.result, groups]);
}

const ICON: Record<Chip["state"], string> = { ok: "✓", warn: "!", bad: "×", info: "i" };

function Chips({ chips, dataId }: { chips: Chip[]; dataId?: string }) {
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
        {b.explainer && <LearnMore id={b.explainer} />}
        {b.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="guide-source">
            {s.label}</a>
        ))}
      </p>
    </div>
  );
}

/** Banners and chips, shown above the results. */
export function ResultsGuide(p: Props) {
  const ctx = useContextFor(p);
  const banners = useMemo(() => (ctx ? resultBanners(ctx) : []), [ctx]);
  const chips = useMemo(() => (ctx ? resultChips(ctx) : []), [ctx]);
  if (!banners.length && !chips.length) return null;
  return (
    <div className="results-guide">
      {banners.map((b) => <BannerView key={b.id} b={b} />)}
      {chips.length > 0 && <Chips chips={chips} dataId={p.readOnly ? undefined : p.dataId} />}
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
