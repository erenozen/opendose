// "Figure" section of a graph's Settings panel: the theme (default or
// classic) and the colour-vision check. The check reads the colours the
// graph actually draws (from the Plotly div of the same card), so it
// covers every graph kind, custom colours, transparency and SuperPlot
// replicate colours alike.
import { useCallback, useId, useRef, useState } from "react";
import type { SchemeId } from "../lib/palette";
import { CVD_LABELS, cvdReport, type CvdRow } from "./cvd";
import { drawnColors, type Drawn } from "./drawnColors";
import { withField, type GraphFormat, type GraphTheme } from "./format";
import { THEMES } from "./theme";
import "./figure.css";

interface Props {
  format: GraphFormat;
  onFormat: (f: GraphFormat) => void;
  scheme: SchemeId;
}

export default function FigurePanel({ format, onFormat, scheme }: Props) {
  const id = useId();
  const theme: GraphTheme = format.theme ?? "default";
  return (
    <div className="figure-section" role="group" aria-labelledby={`${id}-h`}>
      <span className="axis-titles-label" id={`${id}-h`}>Figure style</span>
      <label className="figure-row">
        Theme
        <select value={theme} aria-label="Graph theme"
          onChange={(e) => onFormat(withField(format, "theme",
            e.target.value === "classic" ? "classic" : undefined))}>
          {THEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <CvdCheck scheme={scheme} />
    </div>
  );
}

// ------------------------------------------------------------ CVD check

function CvdCheck({ scheme }: { scheme: SchemeId }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [state, setState] = useState<{ drawn: Drawn; rows: CvdRow[] } | null>(null);
  const run = useCallback(() => {
    const gd = ref.current?.closest(".plot-card")?.querySelector(".plot");
    const drawn = drawnColors(gd);
    if (!drawn) { setState(null); return; }
    setState({ drawn, rows: cvdReport(drawn.series, drawn.background) });
  }, []);
  const issues = state ? state.rows.reduce((n, r) => n + r.confusable.filter((p) => p.severe).length
    + r.lowContrast.length, 0) : 0;
  return (
    <details className="cvd-check" ref={ref}
      onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) run(); }}>
      <summary>
        Colour-vision check
        {state && (
          <span className={`cvd-chip${issues ? " warn" : ""}`}>
            {issues ? `${issues} to look at` : "all clear"}
          </span>
        )}
      </summary>
      {state && <CvdTable drawn={state.drawn} rows={state.rows} scheme={scheme} onRefresh={run} />}
    </details>
  );
}

const names = (s: Drawn["series"], i: number) => s[i]?.label ?? `Series ${i + 1}`;

function CvdTable({ drawn, rows, scheme, onRefresh }: {
  drawn: Drawn; rows: CvdRow[]; scheme: SchemeId; onRefresh: () => void;
}) {
  if (drawn.series.length === 0) {
    return <p className="cvd-note">This graph draws no data colours to check.</p>;
  }
  return (
    <div className="cvd-body">
      {scheme === "colorblind" && drawn.transparent && (
        <p className="cvd-warn" role="note">
          Transparent fills are combined with the colour-blind-safe scheme. Blending with the
          background changes the colours, so the scheme&apos;s guarantees no longer hold for the
          fills; use opaque fills (Format graph → fill opacity 100%) or rely on the borders.
        </p>
      )}
      <table className="cvd-table">
        <tbody>
          {rows.map((r) => {
            const label = r.mode === "normal" ? "Normal vision" : CVD_LABELS[r.mode];
            const severe = r.confusable.filter((p) => p.severe);
            const similar = r.confusable.filter((p) => !p.severe);
            return (
              <tr key={r.mode} data-mode={r.mode}>
                <th scope="row">{label}</th>
                <td>
                  <span className="cvd-swatches" style={{ background: r.mode === "normal"
                    ? drawn.background : undefined }}>
                    {r.colors.map((c, i) => (
                      <span key={i} className="cvd-swatch" style={{ background: c }}
                        title={`${names(drawn.series, i)}: ${c}`} />
                    ))}
                  </span>
                  {severe.map((p) => (
                    <span key={`${p.a}-${p.b}`} className="cvd-flag">
                      {names(drawn.series, p.a)} and {names(drawn.series, p.b)} look the same
                      (ΔE00 {p.dE.toFixed(1)})
                    </span>
                  ))}
                  {similar.length > 0 && (
                    <span className="cvd-similar">
                      Similar: {similar.map((p) => `${names(drawn.series, p.a)} / ${names(drawn.series, p.b)}`
                        + ` (${p.dE.toFixed(1)})`).join(", ")}
                    </span>
                  )}
                  {r.lowContrast.length > 0 && (
                    <span className="cvd-flag">
                      Below 3:1 on the background: {r.lowContrast.map((i) => names(drawn.series, i)).join(", ")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="cvd-note">
        Simulated with the Machado et al. (2009) matrices; ΔE00 is the CIEDE2000 colour
        difference (below 5: the same to the eye as small marks; 5 to 10: similar).
        {drawn.symbols ? " These series also differ by symbol, which keeps them apart in grayscale." : ""}
        {" "}<button type="button" className="link-btn" onClick={onRefresh}>Check again</button>
      </p>
    </div>
  );
}
