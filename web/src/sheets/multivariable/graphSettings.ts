// Settings of the multiple-variables graphs of the data (stored in
// graph.settings.mv) with their defaults, and the groups Format graph
// lists as data sets for each. Pure.
import type { DataTableModel, GraphSheet } from "../../project/types";
import type { ColumnGraphType } from "../../types";
import { variableInfo, type VarInfo } from "./model";

/** Settings of a graph, as its plot reads them (defaults merged). */
export function readSettings<T extends object>(graph: GraphSheet, defaults: T): T {
  const stored = graph.settings.mv;
  return { ...defaults, ...(stored && typeof stored === "object" ? stored as Partial<T> : {}) };
}

export interface XYSettings {
  x: string; y: string; colorBy: string; sizeBy: string; labelBy: string;
  connect: boolean; ellipse: boolean; ellipseLevel: string; hull: boolean;
  summary: boolean;
}

export const ROW_TITLE = "__row_title__";

export function xyDefaults(info: VarInfo[]): XYSettings {
  const cont = info.filter((v) => v.kind === "continuous");
  const many = cont.filter((v) => !v.binary);
  const x = (many[0] ?? cont[0])?.name ?? "";
  const y = ([...many].reverse().find((v) => v.name !== x)
    ?? cont.find((v) => v.name !== x))?.name ?? "";
  return {
    x, y,
    colorBy: info.find((v) => v.kind === "categorical")?.name ?? "",
    sizeBy: "", labelBy: "", connect: false, ellipse: false,
    ellipseLevel: "95", hull: false, summary: false,
  };
}

/** The groups an XY graph of the data colours: levels of the colour-by
 *  variable (plus blanks), or the one Y variable. */
export function xyGroups(info: VarInfo[], s: XYSettings): string[] {
  const colorVar = info.find((v) => v.name === s.colorBy);
  return colorVar?.kind === "categorical" ? [...colorVar.levels, "(blank)"] : [s.y || "Y"];
}

export function mvXYFormatDatasets(table: DataTableModel, graph: GraphSheet): string[] {
  const info = variableInfo(table);
  return xyGroups(info, readSettings(graph, xyDefaults(info)));
}

export interface CatSettings { cat: string; y: string; style: ColumnGraphType }

export function catDefaults(info: VarInfo[]): CatSettings {
  return {
    cat: info.find((v) => v.kind === "categorical")?.name ?? "",
    y: [...info].reverse().find((v) => v.kind === "continuous" && !v.binary)?.name
      ?? info.find((v) => v.kind === "continuous")?.name ?? "",
    style: "scatter",
  };
}

export function mvCatFormatDatasets(table: DataTableModel, graph: GraphSheet): string[] {
  const info = variableInfo(table);
  const s = readSettings(graph, catDefaults(info));
  return info.find((v) => v.name === s.cat && v.kind === "categorical")?.levels ?? [];
}

export interface PcSettings { pcX: number; pcY: number; colorBy: string }

export const biplotDefaults = (info: VarInfo[]): PcSettings => ({
  pcX: 0, pcY: 1, colorBy: info.find((v) => v.kind === "categorical")?.name ?? "",
});

export function biplotGroups(info: VarInfo[], s: PcSettings): string[] {
  const cv = info.find((v) => v.name === s.colorBy && v.kind === "categorical");
  return cv ? cv.levels : ["Scores"];
}

export function biplotFormatDatasets(table: DataTableModel, graph: GraphSheet): string[] {
  const info = variableInfo(table);
  return biplotGroups(info, readSettings(graph, biplotDefaults(info)));
}
