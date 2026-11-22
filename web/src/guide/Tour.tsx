// Five-step guided tour of the example project: coach marks anchored to
// the live interface, with Back / Next / Skip. Finishing or skipping marks
// the tour as done (localStorage); Help › Take the tour replays it.
//
// The card is a Popover anchored to the step's target (top layer, Escape,
// focus kept inside and handed back on close); presses outside do not
// close it, because step 1 asks the user to edit a cell. The ring around
// the target is placed with transform and sized without a transition, so
// nothing relayouts while the page scrolls (GF-04, MO-10).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { announce, Button, Popover } from "../components/ui";
import { belowStickyHeader } from "../components/ui/Popover.anchor";

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
  { anchor: [".pane-answer .checks-toggle", ".checks-toggle", ".pane-answer", ".pane-results"],
    title: "Check the assumptions",
    body: "The Checks row under each result counts the checks: n per group, normality, equal "
      + "SDs and more. Open it for advice and a Learn more link. The checks advise; they never "
      + "block." },
  { anchor: [".plot-card .graph-settings .settings-btn", ".plot-card"], title: "Add significance brackets",
    body: "Graph Settings › Pairwise comparisons… draws brackets with stars or exact P values "
      + "from the multiple comparisons, and keeps them linked to the analysis." },
  { anchor: [".plot-card .export-panel", "[aria-label='Save project']"], title: "Export or save",
    body: "Export the graph as SVG, PDF, PNG or TIFF at journal sizes, or Save project to keep "
      + "data, results and graphs together in one file. Projects also autosave in this browser." },
];

/** Gap between the target and the card, and the card's clearance from the
 *  viewport edges (px). */
const GAP = 12;
const EDGE = 16;
/** The ring sits this far outside its target. */
const RING = 6;

function findAnchor(step: TourStep): HTMLElement | null {
  for (const sel of step.anchor) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

/** Where the card goes: under the target, else above it, else inside its
 *  top edge (a pane taller than the screen); centred with no target. A
 *  point box, so the Popover only clamps it to the viewport. */
function cardPoint(target: HTMLElement | null, card: HTMLElement | null) {
  const w = card?.offsetWidth ?? 340;
  const h = card?.offsetHeight ?? 200;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  // Never over the sticky header.
  const ceiling = belowStickyHeader().top;
  let left: number, top: number;
  if (!target) {
    left = (vw - w) / 2;
    top = Math.max(ceiling, (vh - h) / 2);
  } else {
    const r = target.getBoundingClientRect();
    top = r.bottom + GAP;
    if (top + h > vh - EDGE) top = r.top - h - GAP;
    if (top < ceiling) top = Math.min(vh - h - EDGE, Math.max(ceiling, r.top + GAP));
    left = Math.min(Math.max(EDGE, r.left), vw - w - EDGE);
  }
  return { left, right: left, top, bottom: top };
}

export default function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  // Bumped when the target moves without a scroll (a pane resized, a
  // panel loaded late), so the card is placed again.
  const [moved, setMoved] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // The control that opened the tour, to hand focus back to (GF-03).
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement
    ? document.activeElement : null));
  const titleId = useId();
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  // The ring follows its target: written straight to the element (no
  // React render per scroll frame), on scroll, resize and a slow poll for
  // targets that appear late or move without scrolling.
  useLayoutEffect(() => {
    let box = "";
    let frame = 0;
    const measure = () => {
      const ring = ringRef.current;
      const el = findAnchor(step);
      const r = el?.getBoundingClientRect();
      const next = r ? `${r.left},${r.top},${r.width},${r.height}` : "";
      if (next === box || !ring) return;
      const first = box === "";
      box = next;
      if (!r) { ring.hidden = true; return; }
      ring.hidden = false;
      ring.style.width = `${r.width + 2 * RING}px`;
      ring.style.height = `${r.height + 2 * RING}px`;
      ring.style.transform = `translate(${r.left - RING}px, ${r.top - RING}px)`;
      if (!first) setMoved((m) => m + 1);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    findAnchor(step)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    measure();
    const poll = setInterval(measure, 400);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(poll);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [step]);

  // A new step: focus its primary action and say which step it is.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    nextRef.current?.focus({ preventScroll: true });
    announce(`Step ${i + 1} of ${TOUR_STEPS.length}: ${step.title}`);
  }, [i, step.title]);

  // Focus goes back where it was when the tour began (the Help button
  // when the tour was started from the Help panel, which has closed).
  // After the card has left the top layer, so the check sees where focus
  // really ended up.
  useEffect(() => () => {
    setTimeout(() => {
      const back = opener?.isConnected && opener !== document.body ? opener
        : document.querySelector<HTMLElement>("header button[aria-label^='Help']");
      const a = document.activeElement;
      if (back && (!a || a === document.body || !a.isConnected)) back.focus({ preventScroll: true });
    });
  }, [opener]);

  const finish = useCallback(() => onDone(), [onDone]);
  const anchor = useCallback(() => cardPoint(findAnchor(step), cardRef.current), [step]);
  const clearance = useCallback(() => ({
    top: belowStickyHeader().top, right: EDGE, bottom: EDGE, left: EDGE,
  }), []);

  return (
    <div className="tour" data-step={i + 1}>
      <div ref={ringRef} className="tour-ring" aria-hidden="true" hidden />
      <Popover open onOpenChange={(o) => { if (!o) finish(); }}>
        <Popover.Content ref={cardRef} className="tour-card" aria-labelledby={titleId}
          anchor={anchor} anchorKey={`${i}-${moved}`} side="bottom" align="start"
          sideOffset={0} collisionPadding={clearance} closeOnOutsidePress={false}>
          <p className="tour-count">Step {i + 1} of {TOUR_STEPS.length}</p>
          <h2 id={titleId} className="tour-title">{step.title}</h2>
          <p className="tour-body">{step.body}</p>
          <div className="tour-actions">
            <Button size="sm" className="tour-skip" onClick={finish}>
              {last ? "Close" : "Skip tour"}</Button>
            <span className="tour-spacer" />
            {i > 0 && <Button size="sm" onClick={() => setI(i - 1)}>Back</Button>}
            <Button ref={nextRef} size="sm" variant="primary" className="tour-next"
              onClick={() => (last ? finish() : setI(i + 1))}>{last ? "Done" : "Next"}</Button>
          </div>
        </Popover.Content>
      </Popover>
    </div>
  );
}
