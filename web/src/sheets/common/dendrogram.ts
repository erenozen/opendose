// Dendrograms beside a heat map, drawn from the coordinates the engine's
// `cluster_heatmap` handler returns (scipy's dendrogram, leaves at
// positions 0..n-1 in the clustered order, heights from the linkage). Used
// by the Clustered heat map assay and by the grouped heat map's "Cluster
// rows / columns" toggles, so both draw the same tree. Pure.

export interface Dendrogram {
  /** Leaf-axis coordinates of each link (four points per link). */
  x: number[][];
  /** Heights of each link. */
  y: number[][];
}

/** The dendrogram of an engine answer's `rows` / `columns` block, or null. */
export function parseDendrogram(block: unknown): Dendrogram | null {
  const d = (block && typeof block === "object"
    ? (block as Record<string, unknown>).dendrogram : null) as Record<string, unknown> | null;
  if (!d || !Array.isArray(d.x) || !Array.isArray(d.y) || d.x.length !== d.y.length || !d.x.length) {
    return null;
  }
  const ok = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === "number");
  if (!(d.x as unknown[]).every(ok) || !(d.y as unknown[]).every(ok)) return null;
  return { x: d.x as number[][], y: d.y as number[][] };
}

export interface DendrogramPlacement {
  /** Where the tree sits; its leaves face the heat map. */
  side: "top" | "bottom" | "left" | "right";
  /** Axis number used for the tree (2 → xaxis2 / yaxis2). */
  axis: number;
  /** Domain along the leaves (the heat map's domain on that axis). */
  along: [number, number];
  /** Domain across (the strip the tree takes). */
  across: [number, number];
  /** Number of leaves. */
  n: number;
  line: { color: string; width: number };
}

/** Add one dendrogram's line traces and its two hidden axes. */
export function addDendrogram(traces: object[], layout: Record<string, unknown>,
  d: Dendrogram, p: DendrogramPlacement): void {
  const top = Math.max(...d.y.flat()) * 1.03 || 1;
  const xa = `x${p.axis}`, ya = `y${p.axis}`;
  const hidden = { showgrid: false, zeroline: false, showticklabels: false, ticks: "",
    showline: false, fixedrange: true } as const;
  const leaves: [number, number] = [-0.5, p.n - 0.5];
  const vertical = p.side === "top" || p.side === "bottom";
  d.x.forEach((pos, k) => traces.push({
    type: "scatter", mode: "lines", x: vertical ? pos : d.y[k], y: vertical ? d.y[k] : pos,
    xaxis: xa, yaxis: ya, line: p.line, hoverinfo: "skip", showlegend: false,
  }));
  if (vertical) {
    layout[`xaxis${p.axis}`] = { ...hidden, domain: p.along, anchor: ya, range: leaves };
    layout[`yaxis${p.axis}`] = { ...hidden, domain: p.across, anchor: xa,
      range: p.side === "top" ? [0, top] : [top, 0] };
  } else {
    layout[`xaxis${p.axis}`] = { ...hidden, domain: p.across, anchor: ya,
      range: p.side === "left" ? [top, 0] : [0, top] };
    layout[`yaxis${p.axis}`] = { ...hidden, domain: p.along, anchor: xa,
      range: [p.n - 0.5, -0.5] };
  }
}
