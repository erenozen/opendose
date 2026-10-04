// Tiny inline sketches for the start screen's table-type cards: the shape
// of the table (left) and the graph it typically makes (right). Drawn in
// currentColor / CSS tokens so they follow the theme; decorative.
import type { ReactNode } from "react";
import type { TableType } from "../project/types";

const W = 64, H = 44;

/** A grid of cells; `hl` marks header cells (title row / title column). */
function grid({ cols, rows, xCol = false, titleCol = false, sub = 1 }: {
  cols: number; rows: number; xCol?: boolean; titleCol?: boolean; sub?: number;
}) {
  const cells: ReactNode[] = [];
  const total = cols * sub + (xCol || titleCol ? 1 : 0);
  const cw = (W - 4) / total, ch = (H - 4) / (rows + 1);
  for (let c = 0; c < total; c++) {
    const first = c === 0 && (xCol || titleCol);
    for (let r = 0; r <= rows; r++) {
      const head = r === 0;
      cells.push(<rect key={`${c}-${r}`} x={2 + c * cw} y={2 + r * ch} width={cw} height={ch}
        className={head ? "sk-head" : first ? (xCol ? "sk-x" : "sk-title") : "sk-cell"} />);
    }
  }
  // group separators for subcolumns
  const seps: ReactNode[] = [];
  if (sub > 1) {
    for (let g = 1; g < cols; g++) {
      const x = 2 + ((xCol || titleCol ? 1 : 0) + g * sub) * cw;
      seps.push(<line key={g} x1={x} x2={x} y1={2} y2={H - 2} className="sk-sep" />);
    }
  }
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">{cells}{seps}</svg>;
}

function graph(children: ReactNode) {
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={`M6 4 V${H - 6} H${W - 4}`} className="sk-axis" />
      {children}
    </svg>
  );
}

const dots = (pts: [number, number][]) => pts.map(([x, y], i) => (
  <circle key={i} cx={x} cy={y} r={1.6} className="sk-dot" />));

export const SKETCHES: Record<TableType, { table: ReactNode; graph: ReactNode }> = {
  xy: {
    table: grid({ cols: 2, rows: 5, xCol: true, sub: 2 }),
    graph: graph(<>
      <path d="M8 9 C 26 9, 30 34, 50 35 L60 35" className="sk-line" />
      {dots([[10, 10], [18, 11], [26, 16], [32, 25], [40, 32], [52, 35], [58, 34]])}
    </>),
  },
  column: {
    table: grid({ cols: 3, rows: 5 }),
    graph: graph(<>
      {dots([[16, 26], [18, 30], [14, 28], [32, 18], [34, 22], [30, 20], [48, 10], [50, 14], [46, 12]])}
      <path d="M11 28 H21 M27 20 H37 M43 12 H53" className="sk-line" />
    </>),
  },
  grouped: {
    table: grid({ cols: 2, rows: 4, titleCol: true, sub: 2 }),
    graph: graph(<>
      <rect x="11" y="22" width="6" height="16" className="sk-bar" />
      <rect x="18" y="14" width="6" height="24" className="sk-bar2" />
      <rect x="32" y="18" width="6" height="20" className="sk-bar" />
      <rect x="39" y="9" width="6" height="29" className="sk-bar2" />
    </>),
  },
  contingency: {
    table: grid({ cols: 2, rows: 2, titleCol: true }),
    graph: graph(<>
      <rect x="12" y="10" width="12" height="28" className="sk-bar2" />
      <rect x="12" y="24" width="12" height="14" className="sk-bar" />
      <rect x="36" y="10" width="12" height="28" className="sk-bar2" />
      <rect x="36" y="16" width="12" height="22" className="sk-bar" />
    </>),
  },
  survival: {
    table: grid({ cols: 2, rows: 5, sub: 2 }),
    graph: graph(<>
      <path d="M7 6 H16 V12 H26 V19 H38 V24 H58" className="sk-line" />
      <path d="M7 6 H22 V9 H34 V13 H46 V16 H58" className="sk-line2" />
    </>),
  },
  partsofwhole: {
    table: grid({ cols: 1, rows: 4, titleCol: true }),
    graph: <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <circle cx="32" cy="22" r="16" className="sk-bar" />
      <path d="M32 22 L32 6 A16 16 0 0 1 47.2 27 Z" className="sk-bar2" />
    </svg>,
  },
  multivariable: {
    table: grid({ cols: 5, rows: 5 }),
    graph: graph(<>
      {dots([[10, 34], [14, 30], [20, 31], [24, 25], [30, 24], [34, 19], [40, 18], [46, 13], [52, 11], [56, 8]])}
      <path d="M8 35 L58 8" className="sk-line2" />
    </>),
  },
  nested: {
    table: grid({ cols: 2, rows: 4, sub: 3 }),
    graph: graph(<>
      {dots([[12, 28], [14, 25], [16, 30], [20, 24], [22, 27], [36, 14], [38, 18], [40, 12], [44, 16], [46, 11]])}
      <path d="M10 27 H24 M34 15 H48" className="sk-line" />
    </>),
  },
};

export const CARD_TEXT: Record<TableType, { what: string; analyses: string }> = {
  xy: { what: "Every row has an X (dose, concentration, time) and one or more Y values.",
    analyses: "Curve fits (dose-response, kinetics, lines), interpolation, Deming regression" },
  column: { what: "Each column is one group; its values run down the rows.",
    analyses: "t tests, one-way ANOVA, nonparametric tests, descriptive statistics" },
  grouped: { what: "Two factors: rows are one, columns the other, replicates side by side.",
    analyses: "Two- and three-way ANOVA, repeated measures and mixed models, multiple t tests" },
  contingency: { what: "Counts of subjects: rows are groups, columns are outcomes.",
    analyses: "Fisher's exact and chi-square tests, relative risk, odds ratio, McNemar" },
  survival: { what: "One row per subject: time followed and whether the event happened.",
    analyses: "Kaplan-Meier curves, log-rank test, hazard ratio, median survival" },
  partsofwhole: { what: "Categories that add up to a whole.",
    analyses: "Fraction of total, chi-square goodness of fit, pie and stacked bars" },
  multivariable: { what: "Each row is one observation, each column one variable.",
    analyses: "Multiple and logistic regression, correlation matrix, PCA" },
  nested: { what: "Groups of subgroups (animals, dishes) with replicates inside each.",
    analyses: "Nested t test and nested ANOVA for technical replicates" },
};
