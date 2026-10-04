// Clustered heat map (grouped and multiple-variables tables): hierarchical
// clustering of rows and / or columns (linkage, distance, row z-score or
// centring) with dendrograms drawn beside the reordered heat map, trees
// cut into k clusters with colour strips, k-means with silhouettes and
// the elbow / silhouette / gap table for choosing k, memberships as a
// linked table. Engine: cluster_heatmap.
import type { EngineBridge } from "../../lib/engine";
import type { DataTableModel } from "../../project/types";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph } from "../types";
import type { AssayModule } from "./index";
import { emptyLayout } from "./kit/columns";
import {
  A_CLUSTER, G_CLUSTER, clusterMatrix, clusterPayload, membershipTable, normalizeCluster,
  type ClusterMatrix, type ClusterOptions,
} from "./clusterModel";
import { clusterSample } from "./clusterSample";

const panels = () => import("./clusterPanels");
const ClusterControls = lazyPart(panels, "ClusterControls");
const ClusterResults = lazyPart(panels, "ClusterResults");
const ClusterMethods = lazyPart(panels, "ClusterMethods");
const ClusterPlot = lazyPart(panels, "ClusterPlot");
const ClusterPlotOptions = lazyPart(panels, "ClusterPlotOptions");

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ClusterResult { error?: string; matrixInput?: ClusterMatrix; [key: string]: any }

export function runCluster(engine: EngineBridge, table: DataTableModel, o: ClusterOptions): ClusterResult {
  const m = clusterMatrix(table, o);
  if (m.error) return { error: m.error };
  const r = engine.analyze(clusterPayload(m, o)) as ClusterResult;
  if (r.error) return r;
  return { ...r, matrixInput: m };
}

export const clusterAnalysis = defineAnalysis<ClusterOptions, ClusterResult>({
  id: A_CLUSTER,
  label: "Clustered heat map (hierarchical clustering, k-means)",
  short: "Clustering",
  description: "Cluster rows and columns (linkage, distance, row z-score), draw the "
    + "dendrograms beside the reordered heat map; k-means with the elbow, silhouette and gap.",
  sheetName: (t) => `Clustering of ${t}`,
  defaultOptions: ({ table }) => normalizeCluster({}, table),
  normalizeOptions: (raw, { table }) => normalizeCluster(raw, table),
  run: runCluster,
  defaultGraph: G_CLUSTER,
  ControlsPanel: ClusterControls,
  ResultsPanel: ClusterResults,
  MethodsPanel: ClusterMethods,
  derivedOnDemand: true,
  derivedTable: (result, _source, options) => (result.error || !result.matrixInput ? null
    : membershipTable(result, result.matrixInput, options)),
  derivedName: (t) => `Clusters of ${t}`,
});

export const clusterGraph = defineGraph<ClusterOptions, ClusterResult>({
  id: G_CLUSTER,
  label: "Clustered heat map with dendrograms",
  group: "cluster",
  analysis: A_CLUSTER,
  autoTitles: () => ({ x: "", y: "" }),
  showXTitle: false,
  exportName: "clustered-heat-map",
  PlotPanel: ClusterPlot,
  OptionsPanel: ClusterPlotOptions,
  formatFeatures: { noDatasets: true, noAxes: true },
  sheetName: (t) => `Clustered heat map of ${t}`,
});

export const clusterAssay: AssayModule = {
  id: "cluster",
  label: "Clustered heat map",
  description: "An expression or measurement matrix: rows and columns clustered "
    + "(linkage, distance, row z-score) with dendrograms beside the reordered heat map, "
    + "trees cut into clusters, k-means with the elbow, silhouette and gap.",
  tableType: "multivariable",
  tableName: "Expression matrix",
  emptyTable: () => emptyLayout(clusterSample()),
  sampleTable: clusterSample,
  sampleOptions: () => ({ kRows: "3" }),
  mainAnalysis: A_CLUSTER,
  analyses: [{ def: clusterAnalysis, types: ["grouped", "multivariable"] }],
  graphs: [{ def: clusterGraph, types: ["grouped", "multivariable"] }],
  templates: [{
    id: "clustered-heatmap",
    name: "Expression matrix (clustered heat map)",
    description: "log2 expression of 24 genes in four control and four treated samples. Genes "
      + "are z-scored and clustered by average linkage; the dendrograms sit beside the "
      + "reordered heat map and the gene tree is cut into three clusters.",
    tableName: "Expression matrix",
    table: clusterSample,
    analysis: A_CLUSTER,
    options: { kRows: "3" },
  }],
};
