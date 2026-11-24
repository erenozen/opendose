// The project's statistics table (report/statsTable.ts, P-66) as files:
// CSV, an Excel workbook (the table and a README sheet) and the HTML
// table "Copy for Word" puts on the clipboard. Also finds, for each
// results sheet, the layout panels that draw its graphs. Pure.
import { toDelimited } from "../project/exportTable.ts";
import { panelLetters, resolveLayout } from "../project/layout.ts";
import type { GraphSheet, LayoutSheet, Project } from "../project/types.ts";
import { statsMatrix, statsWordSections, STATS_COLUMNS, STATS_README, type StatsRow } from "../report/statsTable.ts";
import { wordHtml, wordPlain } from "./wordTable.ts";
import { numericCell, writeXlsx, type XlsxCell } from "./xlsx.ts";

/** "Figure 1, panel A" for every layout panel drawing a graph of each
 *  results sheet (by results-sheet id). Letters follow the layout's own
 *  style, written plain, whether or not the page shows them. */
export function panelsByResults(p: Project): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const graphs = new Map(p.sheets.filter((s): s is GraphSheet => s.kind === "graph").map((g) => [g.id, g]));
  for (const l of p.sheets.filter((s): s is LayoutSheet => s.kind === "layout")) {
    const layout = resolveLayout(l);
    const letters = panelLetters(layout.items, { ...layout.letters, show: true, format: "plain" });
    for (const it of layout.items) {
      if (it.kind !== "graph" || !it.graphId) continue;
      const rid = graphs.get(it.graphId)?.resultsId;
      const letter = letters.get(it.id);
      if (!rid || !letter) continue;
      out.set(rid, [...(out.get(rid) ?? []), `${l.name}, panel ${letter}`]);
    }
  }
  return out;
}

/** Columns whose cells are numbers in the workbook (the others stay text,
 *  so a comparison named "2019" is not read as a number). */
const NUMERIC = new Set<keyof StatsRow>(["value", "pExact", "estimateValue", "ciLower", "ciUpper",
  "effectValue", "effectLower", "effectUpper"]);

export function statsCsv(rows: StatsRow[]): string {
  return toDelimited(statsMatrix(rows), "csv");
}

/** The statistics table as an Excel workbook: "Statistics" (the table,
 *  numbers as numbers) and "README" (how it is written). */
export function statsWorkbook(rows: StatsRow[], meta: { title: string; app: string; date: string }): Uint8Array {
  const table: XlsxCell[][] = [
    STATS_COLUMNS.map((c) => c.header),
    ...rows.map((r) => STATS_COLUMNS.map((c) => (NUMERIC.has(c.key) ? numericCell(r[c.key].replace(/^−/, "-"))
      : r[c.key] === "" ? null : r[c.key]))),
  ];
  const readme: XlsxCell[][] = [
    [`${meta.title || "OpenDose project"}: statistics table`],
    [`Made ${meta.date.slice(0, 16).replace("T", " ")} UTC with ${meta.app}.`],
    [],
    ...STATS_README.map((l) => [l]),
    ["P is written as the results sheet writes it (text such as \"< 0.0001\" stays text); P (exact), the statistics, estimates and CI limits are numbers."],
  ];
  return writeXlsx([{ name: "Statistics", rows: table, bold: [0] }, { name: "README", rows: readme, bold: [0] }],
    { title: meta.title, created: meta.date.replace(/\.\d+Z$/, "Z") });
}

/** The Word table: HTML (Word, Google Docs, LibreOffice paste it as a
 *  table, and Word opens it as a file) and the same as tab-separated text. */
export function statsWord(rows: StatsRow[], title: string): { html: string; plain: string } {
  const sections = statsWordSections(rows, title);
  return { html: wordHtml(sections), plain: wordPlain(sections) };
}
