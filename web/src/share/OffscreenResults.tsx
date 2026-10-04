import { Suspense } from "react";
import { useProject } from "../app/context";
import { useAnalysisResult } from "../app/useAnalysisResult";
import { GenericMethodsText } from "../components/MethodsText";
import { findSheet } from "../project/ops";
import type { DataSheet, ResultsSheet } from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";
import EffectSizeCard from "../report/EffectSizeCard";
import ReportCard from "../report/ReportCard";
import StatsMethodsCard from "../report/StatsMethodsCard";

/** A results sheet's panel and methods text, as the workbench draws them. */
export default function OffscreenResults({ sheet }: { sheet: ResultsSheet }) {
  const { project } = useProject();
  const data = findSheet(project, sheet.parentId) as DataSheet | undefined;
  const table = data?.kind === "data" ? data.table : null;
  const { result, options } = useAnalysisResult(sheet, table);
  if (!data || !table) return null;
  const def = tableDef(table.type);
  const aDef = analysisDef(table.type, sheet.analysis);
  const Results = aDef?.ResultsPanel ?? def.ResultsPanel;
  const Methods = aDef?.MethodsPanel ?? (aDef ? GenericMethodsText : undefined);
  const ready = sheet.frozen || result != null;
  return (
    <>
      <div className="bundle-results">
        {ready && Results && (
          <Suspense fallback={<span aria-busy="true" />}>
            <Results sheet={sheet} table={table} options={options} result={result} />
          </Suspense>
        )}
        {ready && <EffectSizeCard result={result} />}
      </div>
      <div className="bundle-methods">
        {ready && Methods && (
          <Suspense fallback={<span aria-busy="true" />}>
            <Methods sheet={sheet} table={table} options={options} result={result} />
          </Suspense>
        )}
        {ready && <StatsMethodsCard sheet={sheet} result={result} />}
      </div>
      <div className="bundle-report">
        {ready && <ReportCard sheet={sheet} table={table} options={options} result={result} />}
      </div>
    </>
  );
}
