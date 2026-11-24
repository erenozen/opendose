// The "Statistical analysis" paragraph under the methods text of a
// results sheet (methods.ts), with a Copy button. Included in the export
// bundle's methods.txt.
import { useProject } from "../app/context";
import { CopyButton } from "../components/CiteBlock";
import { exclusionSentence } from "../project/exclusions";
import { leftOutClause, sheetTable } from "../project/leftOut";
import { currentChoice } from "../guide/choice";
import { designMethodsSentence, designSheetFor } from "../project/studyDesign";
import { blindingMethodsSentence } from "../project/blinding";
import type { DataSheet, ResultsSheet } from "../project/types";
import { powerJustification } from "./facts";
import { usePlanSentence } from "../components/usePlanSentence";
import { statsMethodsParagraph } from "./methods";
import { metaWithReplicates } from "./replicates";
import { useReportPrefs } from "./useReport";
import "./report.css";

export default function StatsMethodsCard({ sheet, result }: { sheet: ResultsSheet; result: unknown }) {
  const { project, results } = useProject();
  const prefs = useReportPrefs();
  const data = project.sheets.find((s) => s.id === sheet.parentId) as DataSheet | undefined;
  const plan = usePlanSentence(sheet.parentId);
  const designSheet = designSheetFor(project, sheet.parentId);
  if (!result || (typeof result === "object" && (result as { error?: unknown }).error)) return null;
  // Unit of n and experiments: typed in Reporting details, else from the
  // table's replicate map (replicates.ts).
  const meta = data ? metaWithReplicates(data.report, data.table, result) : undefined;
  // Excluded in the table, and left out of this analysis only (P-68).
  const exclusions = data ? [exclusionSentence(sheetTable(sheet, data.table)),
    leftOutClause(data.table, sheet.leftOut)].filter(Boolean).join("; ") || null : null;
  const text = statsMethodsParagraph(result, prefs, meta,
    { powerJustification: powerJustification(project, results),
      exclusions, plan,
      design: designSheet ? designMethodsSentence(designSheet.design) : null,
      chosen: currentChoice(sheet),
      blinding: blindingMethodsSentence(data) || null });
  if (!text) return null;
  return (
    <div className="result-card methods-text stats-methods">
      <h3>Statistical analysis</h3>
      <p>{text}</p>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}
