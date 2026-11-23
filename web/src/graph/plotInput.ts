// Graphs must not trap the page's scrolling. Plotly zooms on
// every wheel turn over a plot and starts a pan on every touch, so a
// pointer or a finger that happens to cross a graph stops the page. Two
// listeners on the document, in the capture phase, run before Plotly's
// own and keep the event from reaching it:
//
//   - a wheel turn without Ctrl or Cmd scrolls the page; with Ctrl or Cmd
//     (and a trackpad pinch, which arrives as Ctrl+wheel) Plotly zooms
//     the plot where scrollZoom is on;
//   - a touch that starts on a plot's drag surface scrolls the page; a tap
//     still reaches Plotly as the browser's emulated click, so hover
//     labels and clicks keep working. Annotation drags are untouched
//     (their handles sit outside the drag layer).
//
// Installed once, when Plotly first loads (lib/plotly.ts).

let installed = false;

const onPlot = (t: EventTarget | null, sel: string) =>
  t instanceof Element && !!t.closest(sel);

export function gatePlotInput(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (onPlot(e.target, ".js-plotly-plot")) e.stopPropagation();
  }, { capture: true, passive: true });
  document.addEventListener("touchstart", (e) => {
    if (onPlot(e.target, ".js-plotly-plot .draglayer")) e.stopPropagation();
  }, { capture: true, passive: true });
}
