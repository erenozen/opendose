// Five-step guided tour of the example project: coach marks anchored to
// the live interface, with Back / Next / Skip. Finishing or skipping marks
// the tour as done (localStorage); Help › Take the tour replays it.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";

interface TourStep { anchor: string[]; title: string; body: string }

const TOUR_STEPS: TourStep[] = [
  { anchor: [".pane-table .data-table", ".pane-table"], title: "Change a value",
    body: "This is the data: three groups of six measurements. Type a new number into any "
      + "cell and watch the graph and the ANOVA P value update as you type. "
      + `${MOD}Z undoes it.` },
  { anchor: [".analyze-wrap", ".analyze-btn"], title: "Analyze, or ask which test",
    body: "Analyze adds another analysis of this table. Not sure which one? “Help me choose…” at "
      + "the top of the menu asks about your design, checks the data and recommends a test, "
      + "with its reason and the alternatives." },
  { anchor: [".guide-chips-wrap", ".pane-results"], title: "Check the assumptions",
    body: "Chips above every result sum up the checks: n per group, normality, equal SDs and "
      + "more. Click one for advice and a Learn more link. They advise; they never block." },
  { anchor: [".plot-card .graph-settings .settings-btn", ".plot-card"], title: "Add significance brackets",
    body: "Graph Settings › Pairwise comparisons… draws brackets with stars or exact P values "
      + "from the multiple comparisons, and keeps them linked to the analysis." },
  { anchor: [".plot-card .export-panel", "[aria-label='Save project']"], title: "Export or save",
    body: "Export the graph as SVG, PDF, PNG or TIFF at journal sizes, or Save project to keep "
      + "data, results and graphs together in one file. Projects also autosave in this browser." },
];

interface Box { top: number; left: number; width: number; height: number }

function findAnchor(step: TourStep): HTMLElement | null {
  for (const sel of step.anchor) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

export default function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const step = TOUR_STEPS[i];

  const measure = useCallback(() => {
    const el = findAnchor(step);
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox((b) => (b && b.top === r.top && b.left === r.left && b.width === r.width
      && b.height === r.height ? b : { top: r.top, left: r.left, width: r.width, height: r.height }));
  }, [step]);

  // Anchors can appear late (lazy panels) or move (scroll, resize).
  useEffect(() => {
    const el = findAnchor(step);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    measure();
    const t = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useLayoutEffect(() => {
    const c = cardRef.current;
    if (!c) return;
    const w = c.offsetWidth, h = c.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 12, m = 16;
    if (!box) { setCard({ top: Math.max(m, (vh - h) / 2), left: Math.max(m, (vw - w) / 2) }); return; }
    let top = box.top + box.height + gap;
    if (top + h > vh - m) top = box.top - h - gap;
    if (top < m) top = Math.min(vh - h - m, Math.max(m, box.top + gap));
    let left = box.left;
    left = Math.min(Math.max(m, left), vw - w - m);
    setCard({ top, left });
  }, [box, i]);

  useEffect(() => { cardRef.current?.querySelector<HTMLElement>(".tour-next")?.focus(); }, [i]);

  const finish = useCallback(() => onDone(), [onDone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const last = i === TOUR_STEPS.length - 1;
  return (
    <div className="tour" data-step={i + 1}>
      {box && (
        <div className="tour-ring" aria-hidden="true" style={{
          top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12,
        }} />
      )}
      <div ref={cardRef} className="tour-card" role="dialog" aria-modal="false"
        aria-labelledby={titleId}
        style={card ? { top: card.top, left: card.left } : { visibility: "hidden" }}>
        <p className="tour-count">Step {i + 1} of {TOUR_STEPS.length}</p>
        <h2 id={titleId} className="tour-title">{step.title}</h2>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={finish}>
            {last ? "Close" : "Skip tour"}</button>
          <span className="tour-spacer" />
          {i > 0 && <button type="button" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="btn-primary tour-next"
            onClick={() => (last ? finish() : setI(i + 1))}>{last ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
