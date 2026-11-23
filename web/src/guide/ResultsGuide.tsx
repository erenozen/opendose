// Guidance around a results sheet: the "What does each value represent?"
// question, plain-language notes and the assumption checklist chips (all
// in the Checks row of the results headline, components/ResultsChecks.tsx,
// the most severe note as the pane's one callout), and the "Why your
// number may differ" note under the results. Everything is advice;
// nothing blocks. (A P value withheld at one value per group is the
// analysis' own result: sheets/common/withheld.ts.)
import { useId, useMemo, useState } from "react";
import { Banner as BannerBox, Button, NumText } from "../components/ui";
import { openPowerTool } from "../power/events";
import type { Banner } from "./banners";
import type { Chip } from "./checks";
import { differNotes } from "./differ";
import LearnMore from "./LearnMore";
import MultiplicityActions from "./MultiplicityActions";
import type { MultiplicityFacts } from "./multiplicity";
import { InteractionAction } from "./InteractionAction";
import { BarAxisAction } from "./BarAxisAction";
import { SexFactorAction } from "./SexFactorAction";
import { openAssignReplicates } from "../report/useReport";
import type { Source } from "./sources";
import { useContextFor, type ResultsGuideProps } from "./useResultsGuidance";
import "./resultsGuide.css";

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

export function Chips({ chips, dataId, multiplicity, readOnly }: {
  chips: Chip[]; dataId?: string; multiplicity: MultiplicityFacts | null; readOnly?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const detailId = useId();
  const cur = chips.find((c) => c.id === open);
  return (
    <div className="guide-chips-wrap">
      <ul className="guide-chips" aria-label="Assumption checklist">
        {chips.map((c) => (
          <li key={c.id}>
            <Button size="sm" className={`guide-chip chip-${c.state}`}
              aria-expanded={open === c.id} aria-controls={detailId}
              onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="chip-icon" aria-hidden="true">{ICON[c.state]}</span>
              <span>
                <span className="sr-only">{c.state === "ok" ? "OK: " : c.state === "info" ? "Note: "
                  : "Check: "}</span>
                {c.label}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {cur && (
        <div id={detailId} className={`guide-chip-detail chip-${cur.state}`} role="region"
          aria-label={cur.label}>
          <p>{cur.detail}</p>
          {cur.action === "assign-replicates" && dataId && (
            <p className="guide-chip-action">
              <Button size="sm" onClick={() => openAssignReplicates(dataId)}>
                Assign replicates…</Button>
            </p>
          )}
          {cur.action === "open-power" && (
            <p className="guide-chip-action">
              <Button size="sm" onClick={() => openPowerTool("power")}>
                Plan replication with the power tool…</Button>
            </p>
          )}
          {cur.action === "multiplicity" && multiplicity && <MultiplicityActions facts={multiplicity} />}
          {cur.action === "interaction" && dataId && !readOnly && <InteractionAction dataId={dataId} />}
          {cur.action === "bar-axis" && cur.target && !readOnly && <BarAxisAction graphId={cur.target} />}
          {cur.action === "sex-two-way" && dataId && !readOnly && <SexFactorAction dataId={dataId} />}
          <Sources sources={cur.sources} />
          {cur.explainer && <LearnMore id={cur.explainer} />}
        </div>
      )}
    </div>
  );
}

function NoteBody({ b }: { b: Banner }) {
  return (
    <>
      <p><NumText text={b.body} /></p>
      {b.fixes.length > 0 && (
        <>
          <p className="guide-note-sub">What to try</p>
          <ul>{b.fixes.map((f, i) => <li key={i}><NumText text={f} /></li>)}</ul>
        </>
      )}
    </>
  );
}

function NoteFoot({ b }: { b: Banner }) {
  if (!b.explainer && !b.sources.length) return null;
  return (
    <p className="guide-note-foot">
      {b.explainer && <LearnMore id={b.explainer} />}
      {b.sources.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="guide-source">
          {s.label}</a>
      ))}
    </p>
  );
}

/** One plain-language note about the result. `callout`: the pane's one
 *  tinted callout (the Banner primitive); otherwise a plain block inside
 *  the Checks row. */
export function GuideNote({ b, callout }: { b: Banner; callout?: boolean }) {
  const power = b.action === "open-power" && (
    <Button size="sm" onClick={() => openPowerTool("power")}>Plan replication with the power tool…</Button>
  );
  if (callout) {
    return (
      <BannerBox tone={b.tone} className="guide-callout" data-banner={b.id}>
        <BannerBox.Title>{b.title}</BannerBox.Title>
        <BannerBox.Detail><NoteBody b={b} /><NoteFoot b={b} /></BannerBox.Detail>
        {power && <BannerBox.Actions>{power}</BannerBox.Actions>}
      </BannerBox>
    );
  }
  const titleId = `guide-note-${b.id}`;
  return (
    <section className="guide-note" data-banner={b.id} data-tone={b.tone} aria-labelledby={titleId}>
      <p id={titleId} className="guide-note-title">{b.title}</p>
      <NoteBody b={b} />
      {power && <p className="guide-chip-action">{power}</p>}
      <NoteFoot b={b} />
    </section>
  );
}

/** "Why your number may differ", collapsed, under the results. */
export function DifferNote(p: ResultsGuideProps) {
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
