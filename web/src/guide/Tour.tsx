// Five-step guided tour of the example project: coach marks anchored to
// the live interface, with Back / Next / Skip. Finishing or skipping marks
// the tour as done (localStorage); Help › Take the tour replays it.
//
// The card is a Popover anchored to the step's target (top layer, Escape,
// focus handed back on close); presses outside do not
// close it, because step 1 asks the user to edit a cell. The dim and the
// accent ring around the target are full-screen layers cut with
// clip-path, so following the target while the page scrolls lays nothing
// out. After a pointer press on Next or Back the ring and
// card glide to the new target (200 ms, --ease-in-out); a key press and
// reduced motion jump (motion plan 010).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { announce, Button, lastInputWasKeyboard, Popover } from "../components/ui";
import { belowStickyHeader } from "../components/ui/Popover.anchor";
import { prefersReducedMotion } from "../components/ui/useDismiss";

const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";

interface TourStep { anchor: string[]; title: string; body: string }

const TOUR_STEPS: TourStep[] = [
  { anchor: [".pane-table .data-table", ".pane-table"], title: "Change a value",
    body: "This is the data. Type a new number into any cell and watch the results and the "
      + "graph update as you type. "
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
    body: "On a graph that compares groups, Settings › Pairwise comparisons… draws brackets "
      + "with stars or exact P values from the multiple comparisons and keeps them linked to "
      + "the analysis." },
  { anchor: [".plot-card .export-panel", "[aria-label='Save project']"], title: "Export or save",
    body: "Export the graph as SVG, PDF, PNG or TIFF at journal sizes, or Save project to keep "
      + "data, results and graphs together in one file. Projects also autosave in this browser." },
];

/** Gap between the target and the card, and the card's clearance from the
 *  viewport edges (px). */
const GAP = 12;
const EDGE = 16;
/** The ring sits this far outside its target, and is this thick. */
const RING = 6;
const STROKE = 2;

/** A rounded rectangle as clockwise path commands. Every rectangle has
 *  the same commands, so clip-path can interpolate between two of them. */
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const n = (v: number) => Math.round(v * 10) / 10;
  return `M${n(x + k)} ${n(y)}H${n(x + w - k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + w)} ${n(y + k)}`
    + `V${n(y + h - k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + w - k)} ${n(y + h)}`
    + `H${n(x + k)}A${n(k)} ${n(k)} 0 0 1 ${n(x)} ${n(y + h - k)}`
    + `V${n(y + k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + k)} ${n(y)}Z`;
}

/** A motion or radius token from tokens.css, for WAAPI and timers. */
function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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
  const tourRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  // Set by a pointer press on Next or Back: the next step glides there.
  const glideFrom = useRef<DOMRect | null>(null);
  // Started from the keyboard: the dim appears at once, like the card.
  const [instant] = useState(lastInputWasKeyboard);
  const nextRef = useRef<HTMLButtonElement>(null);
  // The control that opened the tour, to hand focus back to.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement
    ? document.activeElement : null));
  const titleId = useId();
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  // The dim and ring follow their target: written straight to the
  // elements (no React render per scroll frame), on scroll, resize and a
  // slow poll for targets that appear late or move without scrolling.
  // Only the first placement after a pointer-pressed step change
  // transitions (data-moving); every other one lands at once.
  useLayoutEffect(() => {
    let box = "";
    let frame = 0;
    let settle = 0;
    let alive = true;
    const tourEl = tourRef.current;
    const measure = () => {
      const tour = tourRef.current, dim = dimRef.current, ring = ringRef.current;
      const el = findAnchor(step);
      const r = el?.getBoundingClientRect();
      const next = r ? `${r.left},${r.top},${r.width},${r.height}` : "";
      if (next === box || !tour || !dim || !ring) return;
      const first = box === "";
      box = next;
      dim.hidden = ring.hidden = !r;
      if (!r) return;
      const glide = first && !!glideFrom.current;
      if (glide) tour.setAttribute("data-moving", "");
      const radius = Number.parseFloat(token("--radius-dialog")) || 8;
      const x = r.left - RING, y = r.top - RING, w = r.width + 2 * RING, h = r.height + 2 * RING;
      const hole = roundRect(x, y, w, h, radius);
      dim.style.clipPath = `path(evenodd, "M0 0H100000V100000H0Z${hole}")`;
      ring.style.clipPath = `path(evenodd, "${hole}${roundRect(x + STROKE, y + STROKE,
        w - 2 * STROKE, h - 2 * STROKE, radius - STROKE)}")`;
      // The glide ends with its transitions (or at once if none started);
      // a scroll that retargets it ends it too, so the ring snaps to its
      // target instead of trailing it.
      if (glide) {
        cancelAnimationFrame(settle);
        settle = requestAnimationFrame(() => {
          const runs = ring.getAnimations();
          const done = () => { if (alive) tour.removeAttribute("data-moving"); };
          if (!runs.length) done();
          else Promise.all(runs.map((a) => a.finished)).then(done, done);
        });
      }
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
      alive = false;
      cancelAnimationFrame(settle);
      // A step change that glides again keeps it on, so a press during a
      // glide turns it from where it is instead of jumping to its end.
      if (!glideFrom.current) tourEl?.removeAttribute("data-moving");
      clearInterval(poll);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [step]);

  // The card moves from where it was to its new place by transform (a
  // FLIP), after the Popover has placed it for the new step.
  useLayoutEffect(() => {
    const card = cardRef.current, was = glideFrom.current;
    glideFrom.current = null;
    if (!card || !was) return;
    const now = card.getBoundingClientRect();
    const dx = Math.round(was.left - now.left), dy = Math.round(was.top - now.top);
    if (!dx && !dy) return;
    card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: Number.parseFloat(token("--dur-enter")) || 200,
      easing: token("--ease-in-out") || "ease-in-out",
    });
  }, [i]);

  // Back and Next. The next target is scrolled into view first, so the
  // card is placed once, where it will stay.
  const go = (n: number) => {
    const glide = !lastInputWasKeyboard() && !prefersReducedMotion();
    glideFrom.current = glide ? cardRef.current?.getBoundingClientRect() ?? null : null;
    findAnchor(TOUR_STEPS[n])?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    setI(n);
  };

  // A new step: focus its primary action and say which step it is.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    nextRef.current?.focus({ preventScroll: true });
    announce(`Step ${i + 1} of ${TOUR_STEPS.length}: ${step.title}`);
  }, [i, step.title]);

  // Focus goes back where it was when the tour began (started from the
  // Help panel, that is where the panel handed it back: its opener).
  // After the card has left the top layer, so the check sees where focus
  // really ended up.
  useEffect(() => () => {
    setTimeout(() => {
      const back = opener?.isConnected && opener !== document.body ? opener : null;
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
    <div ref={tourRef} className="tour" data-step={i + 1} data-instant={instant || undefined}>
      <div ref={dimRef} className="tour-dim" aria-hidden="true" hidden />
      <div ref={ringRef} className="tour-ring" aria-hidden="true" hidden />
      <Popover open onOpenChange={(o) => { if (!o) finish(); }}>
        <Popover.Content ref={cardRef} className="tour-card" aria-labelledby={titleId}
          placeAt={anchor} anchorKey={`${i}-${moved}`} side="bottom" align="start"
          sideOffset={0} collisionPadding={clearance} closeOnOutsidePress={false} trapFocus={false}>
          <p className="tour-count">Step {i + 1} of {TOUR_STEPS.length}</p>
          <h2 id={titleId} className="tour-title">{step.title}</h2>
          <p className="tour-body">{step.body}</p>
          <div className="tour-actions">
            <Button size="sm" className="tour-skip" onClick={finish}>
              {last ? "Close" : "Skip tour"}</Button>
            <span className="tour-spacer" />
            {i > 0 && <Button size="sm" onClick={() => go(i - 1)}>Back</Button>}
            <Button ref={nextRef} size="sm" variant="primary" className="tour-next"
              onClick={() => (last ? finish() : go(i + 1))}>{last ? "Done" : "Next"}</Button>
          </div>
        </Popover.Content>
      </Popover>
    </div>
  );
}
