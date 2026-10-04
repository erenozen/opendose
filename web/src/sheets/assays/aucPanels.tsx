// Controls, results, methods text and graph of the XY area-under-the-curve
// analysis.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { fmtCI, levelPct, stars } from "../common/statFormat";
import { pText } from "./format";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import {
  BASELINE_LABELS, ciFraction, shadedRegions, type AucBaseline, type AucOptions,
  type PeakDirection,
} from "./aucModel";
import { Card, Grid, KV, Note, Problem, Select, TextIn } from "./ui";
import { axis, chromeOf, layoutBase, messageLayout, useDark } from "./plotkit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const f = (v: unknown) => (typeof v === "number" ? formatSig(v) : "n/a");

export function AucControls({ table, options: o, onChange }: ControlsProps<AucOptions>) {
  const set = (patch: Partial<AucOptions>) => onChange({ ...o, ...patch });
  const summary = table.subcolumnFormat !== "replicates";
  const reps = Math.max(1, ...table.datasets.map((d) => d.rows[0]?.length ?? 1));
  return (
    <div className="controls">
      <section>
        <h3>Baseline</h3>
        <Select label="Baseline" value={o.baseline}
          options={(Object.keys(BASELINE_LABELS) as AucBaseline[]).map((k) => [k, BASELINE_LABELS[k]] as const)}
          onChange={(baseline) => set({ baseline })}
          hint="The area is computed above this horizontal line; parts of the curve below it count as negative area." />
        {o.baseline === "value" && (
          <TextIn label="Baseline Y" value={o.baselineValue}
            onChange={(baselineValue) => set({ baselineValue })} />
        )}
      </section>
      <section>
        <h3>Peaks</h3>
        <Select<PeakDirection> label="Peaks to count" value={o.peakDirection}
          options={[["positive", "Above the baseline"], ["negative", "Below the baseline"],
            ["both", "Above and below (net area)"]]}
          onChange={(peakDirection) => set({ peakDirection })} />
        <TextIn label="Ignore peaks lower than (% of Y range)" value={o.minPeakHeightPct}
          onChange={(minPeakHeightPct) => set({ minPeakHeightPct })}
          hint="Height measured from the baseline, as a percentage of the distance from the lowest to the highest Y (default 10%)." />
        <TextIn label="Ignore peaks defined by fewer than (points)" value={o.minPeakPoints}
          inputMode="numeric" onChange={(minPeakPoints) => set({ minPeakPoints })} />
      </section>
      <section>
        <h3>Replicates</h3>
        {summary ? (
          <p className="hint-block">
            The table holds means with errors and N: the SE of each area is
            computed from them (subcolumns cannot be separate experiments).
          </p>
        ) : (
          <Select label="Subcolumns are" value={o.replicates}
            options={[["within", "Replicates of one experiment (SE of the area)"],
              ["experiments", "Separate experiments (one area each)"]]}
            onChange={(replicates) => set({ replicates })}
            disabled={reps < 2}
            hint={o.replicates === "within"
              ? "The SE follows Gagnon & Peterson (1998): the area is a weighted sum of the row means, so its variance is the sum of weight² × SD² / n."
              : "Each subcolumn gets its own area; the areas are then summarised (mean, SD, SEM, CI) and compared with a t test or one-way ANOVA."} />
        )}
        <TextIn label="Confidence level (%)" value={o.ciLevel}
          onChange={(ciLevel) => set({ ciLevel })} />
      </section>
    </div>
  );
}

function Comparison({ cmp, level }: { cmp: R; level: number }) {
  const rows: [string, string][] = [];
  if (cmp.bailer_z) {
    const b = cmp.bailer_z;
    rows.push(["Difference (first − second)", `${f(b.difference)} (SE ${f(b.se)})`]);
    rows.push(["Bailer z test", `z = ${f(b.z)}, ${pText(b.p)} ${stars(b.p)}`]);
  }
  if (cmp.t_test) {
    const t = cmp.t_test;
    rows.push(["Unpaired t test from area, SE and df",
      `t(${t.df}) = ${f(t.t)}, ${pText(t.p)} ${stars(t.p)}`]);
  }
  if (cmp.bailer_chi2 && !cmp.bailer_z) {
    const c = cmp.bailer_chi2;
    rows.push(["Bailer chi-square (all areas equal)",
      `χ²(${c.df}) = ${f(c.chi2)}, ${pText(c.p)} ${stars(c.p)}`]);
  }
  if (cmp.anova && !cmp.bailer_z) {
    const a = cmp.anova;
    rows.push(["One-way ANOVA from area, SE and df",
      `F(${a.dfn}, ${a.dfd}) = ${f(a.F)}, ${pText(a.p)} ${stars(a.p)}`]);
  }
  if (cmp.test) {
    // one area per experiment: an ordinary t test or ANOVA of the areas
    rows.push([cmp.test === "one-way ANOVA" ? "One-way ANOVA of the areas" : `${cmp.test} of the areas`,
      cmp.F != null ? `F(${cmp.dfn}, ${cmp.dfd}) = ${f(cmp.F)}, ${pText(cmp.p)} ${stars(cmp.p)}`
        : `t(${formatSig(cmp.df, 4)}) = ${f(cmp.t)}, ${pText(cmp.p)} ${stars(cmp.p)}`]);
    if (cmp.difference != null) rows.push(["Difference of mean areas", f(cmp.difference)]);
  }
  return (
    <>
      <h4>Comparing the areas{cmp.names ? ` (${(cmp.names as string[]).join(", ")})` : ""}</h4>
      <KV rows={rows} caption="Comparison of areas" />
      <p className="hint-block">
        {cmp.test
          ? "Each subcolumn is a separate experiment, so the areas are compared like any other measurement."
          : `The areas are compared with the SE of each (normal-theory z, ${levelPct(level)} CIs use z as the statistics guide states); the t test uses df = number of values − number of X values, the guide's recipe.`}
      </p>
    </>
  );
}

export function AucResults({ options, result }: ResultsProps<AucOptions, R>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const level = ciFraction(options.ciLevel);
  const ds = (result.datasets ?? []) as R[];
  const experiments = result.replicates === "experiments";
  const ok = ds.filter((d) => !d.error);
  return (
    <>
      <Card title="Area under the curve">
        {ds.filter((d) => d.error).map((d) => (
          <Note key={d.name} warn>{d.name}: {String(d.error)}</Note>
        ))}
        {experiments ? (
          <Grid caption="Area per experiment" head={["", "Mean area", "SD", "SEM",
            `${levelPct(level)} CI`, "n", "Area of each subcolumn"]}
          rows={ok.map((d) => [d.name, f(d.mean), f(d.sd), f(d.sem), fmtCI(d.ci), d.n,
            (d.per_replicate as (number | null)[]).map((v) => (v == null ? "–" : formatSig(v))).join(", ")])} />
        ) : (
          <Grid caption="Area per data set" head={["", "Area", "SE", `${levelPct(level)} CI`, "df",
            "Baseline", "X range", "Peaks counted", "Total peak area"]}
          rows={ok.map((d) => [d.name, f(d.area), f(d.se), fmtCI(d.ci), d.df ?? "n/a",
            f(d.baseline), `${f(d.x_range?.[0])} to ${f(d.x_range?.[1])}`, d.n_peaks,
            f(d.total_peak_area)])} />
        )}
        {!experiments && ok.length > 0 && (
          <>
            <h4>Areas above and below the baseline</h4>
            <Grid caption="Total and net areas" head={["", "Total area (all regions)",
              "Above baseline", "Below baseline", "Net peak area", "Signed area"]}
            rows={ok.map((d) => [d.name, f(d.total_area), f(d.area_above), f(d.area_below),
              d.net_peak_area == null ? "n/a" : f(d.net_peak_area), f(d.area)])} />
            <p className="hint-block">
              Total area adds every region, above and below the baseline, counted
              as a peak or not; the signed area subtracts the regions below. Net
              peak area (peaks above minus peaks below) needs “Above and below”.
            </p>
          </>
        )}
        {result.comparison && <Comparison cmp={result.comparison} level={level} />}
      </Card>
      {!experiments && ok.map((d) => (
        <Card key={d.name} title={`Peaks: ${d.name}`}>
          <Grid caption={`Regions of ${d.name}`} head={["Region", "Direction", "Starts at X",
            "Ends at X", "Peak X", "Peak Y", "Height", "Points", "Area", "% of peak area", "Counted"]}
          rows={(d.peaks as R[]).map((p, i) => [i + 1, p.direction, f(p.x_start), f(p.x_end),
            f(p.peak_x), f(p.peak_y), f(p.height), p.n_points, f(p.area),
            p.fraction == null ? "–" : `${formatSig(100 * p.fraction, 3)}%`,
            p.counted ? "Yes" : "No"])} />
          <p className="hint-block">
            Peaks lower than {f(d.peak_threshold)} (the minimum height) are not
            counted. Crossings of the baseline are found by linear interpolation;
            nothing is extrapolated beyond the first or last X.
          </p>
        </Card>
      ))}
    </>
  );
}

export function AucMethods({ options, result }: ResultsProps<AucOptions, R>) {
  if (!result || result.error) return null;
  const level = ciFraction(options.ciLevel);
  const base = BASELINE_LABELS[options.baseline].toLowerCase();
  let text = `The area under each curve was computed by the trapezoid rule over the `
    + `measured points (no smoothing or extrapolation), above a baseline of ${base}`
    + `${options.baseline === "value" ? ` (${options.baselineValue})` : ""}. `
    + `Peaks lower than ${options.minPeakHeightPct}% of the range of Y were ignored. `;
  if (result.replicates === "experiments") {
    text += `One area was computed per experiment (subcolumn) and the areas were summarised `
      + `as mean, SD and ${levelPct(level)} CI`;
    text += result.comparison ? ` and compared with ${result.comparison.test === "one-way ANOVA"
      ? "an ordinary one-way ANOVA" : `an ${result.comparison.test}`}. ` : ". ";
  } else {
    text += `The standard error of each area was computed from the replicate values `
      + `(Gagnon and Peterson, 1998; Bailer, 1988) with a ${levelPct(level)} confidence interval `
      + `from the normal distribution`;
    text += result.comparison ? `; areas were compared with Bailer's z test${
      result.comparison.t_test ? " and an unpaired t test from area, SE and df" : ""}. ` : ". ";
  }
  text += "Analysis in OpenDose (open-source, built on SciPy).";
  return <CopyableMethods text={text} />;
}

export function AucPlot({ result, titles, scheme, format, onFormatChange }: PlotProps<AucOptions, R>) {
  const dark = useDark();
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!result || result.error || !Array.isArray(result.datasets)) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        result?.error ? "No graph: the analysis did not run" : "Computing the areas…"), names: [] };
    }
    const traces: Plotly.Data[] = [];
    const ds = result.datasets as R[];
    const names = ds.map((d) => String(d.name));
    const shapes: Partial<Plotly.Shape>[] = [];
    ds.forEach((d, i) => {
      if (d.error || !d.points) return;
      const { color, symbol } = seriesStyle(i, dark, scheme);
      const x = d.points.x as number[];
      const y = d.points.y as number[];
      const base = d.baseline as number;
      for (const reg of shadedRegions(x, y, base)) {
        traces.push(tagTrace({
          type: "scatter", mode: "lines", x: reg.x, y: reg.y, fill: "toself",
          fillcolor: color + (reg.sign > 0 ? "40" : "1c"), line: { width: 0 },
          hoverinfo: "skip", showlegend: false, legendgroup: d.name,
        }, { ds: i, role: "band" }) as Plotly.Data);
      }
      traces.push(tagTrace({
        type: "scatter", mode: "lines+markers", x, y, name: d.name, legendgroup: d.name,
        line: { color, width: 2 },
        marker: { color, symbol, size: 8, line: { color: chrome.surface, width: 1.5 } },
        hovertemplate: `${d.name}<br>X %{x:.4g}<br>Y %{y:.4g}<extra></extra>`,
      }, { ds: i, role: "points" }) as Plotly.Data);
      const counted = ((d.peaks ?? []) as R[]).filter((p) => p.counted);
      if (counted.length) {
        traces.push(tagTrace({
          type: "scatter", mode: "markers", x: counted.map((p) => p.peak_x),
          y: counted.map((p) => p.peak_y), showlegend: false, legendgroup: d.name,
          marker: { color, symbol: "triangle-down-open", size: 13, line: { width: 1.5, color } },
          hovertemplate: `${d.name}: peak at X %{x:.4g}<extra></extra>`,
        }, { ds: i, role: "decor" }) as Plotly.Data);
      }
      shapes.push({
        type: "line", xref: "x", yref: "y", x0: x[0], x1: x[x.length - 1], y0: base, y1: base,
        line: { color, width: 1.2, dash: "dash" },
      });
    });
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x),
      yaxis: axis(chrome, titles.y),
      shapes,
      showlegend: names.length > 1,
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: chrome.ink } },
    });
    return { traces, layout, names };
  }, [result, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: fig.names }), [dark, scheme, fig.names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="area-under-curve" />
  );
}
