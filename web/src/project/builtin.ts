// Ids of the analyses and graph kinds that ship with the app. The sheets
// registry (src/sheets) owns their behavior; these constants exist so the
// pure project code (v1 migration) can name them without importing React.
export const ANALYSIS_NONLIN = "nonlin";
export const ANALYSIS_COLUMN = "column";
export const ANALYSIS_CONTINGENCY = "contingency";
export const ANALYSIS_SURVIVAL = "survival";

export const GRAPH_XY = "xy";
/** The Schild plot of an EC50-shift fit (sheets/xy/SchildPlot.tsx). */
export const GRAPH_SCHILD = "schild_plot";
export const GRAPH_SURVIVAL = "survival";
export const COLUMN_GRAPHS = ["scatter", "bar", "box", "violin", "raincloud"] as const;
