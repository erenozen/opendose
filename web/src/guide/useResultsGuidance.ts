// What the results guidance says about a result (ResultsGuide.tsx
// renders it): the unit question, the plain-language notes and the
// assumption chips.
import { useMemo } from "react";
import { useProject } from "../app/context";
import type { DataTableModel, TableType } from "../project/types";
import { resultBanners, type Banner } from "./banners";
import { resultChips, type Chip, type ResultContext } from "./checks";
import { needsUnitQuestion } from "./declareUnit";
import { multiplicityFacts, type MultiplicityFacts } from "./multiplicity";
import { useSeparateTests } from "./useSeparateTests";
import { useGroupChecks } from "./useGroupChecks";
import { useSmallN } from "./useSmallN";

export interface ResultsGuideProps {
  analysisId: string;
  tableType: TableType;
  table: DataTableModel;
  options: unknown;
  result: unknown;
  /** The data sheet, for one-click fixes (absent or read-only: none). */
  dataId?: string;
  /** The results sheet shown (for the count of t tests on its table). */
  resultsId?: string;
  readOnly?: boolean;
}
type Props = ResultsGuideProps;

export function useContextFor(p: Props, extra: Partial<ResultContext> = {}): ResultContext | null {
  // Normality per group only matters to the column analyses' chips.
  const groups = useGroupChecks(p.table, !!p.result && p.analysisId === "column");
  const { sensitivity, needed, multiplicity, separate } = extra;
  return useMemo(() => (p.result && typeof p.result === "object" ? {
    tableType: p.tableType, analysisId: p.analysisId, table: p.table, groups,
    options: (p.options && typeof p.options === "object" ? p.options : {}) as Record<string, unknown>,
    result: p.result as Record<string, unknown>,
    sensitivity, needed, multiplicity, separate,
  } : null), [p.tableType, p.analysisId, p.table, p.options, p.result, groups,
    sensitivity, needed, multiplicity, separate]);
}

/** Mixed models with the unit (grouped / multiple variables) or the
 *  subject (time course) as a random effect. */
const UNIT_MODELLED = /^(grouped_nested_two_way|mv_mixed_grouping|assay_timecourse_)/;

export interface Guidance {
  banners: Banner[];
  chips: Chip[];
  multiplicity: MultiplicityFacts | null;
  /** "What does each value represent?" is asked about this table. */
  question: boolean;
}

/** Everything the guidance says about a result: the question, the notes
 *  and the assumption chips. */
export function useResultsGuidance(p: Props): Guidance {
  const { project, readOnly: shared } = useProject();
  const { sensitivity, needed } = useSmallN(p.result);
  const multiplicity = useMemo(() => {
    if (!p.dataId || !p.resultsId || p.analysisId !== "column") return null;
    const f = multiplicityFacts(project, p.dataId);
    return f && f.runs.some((t) => t.sheetId === p.resultsId) ? f : null;
  }, [project, p.dataId, p.resultsId, p.analysisId]);
  const separate = useSeparateTests(p.dataId, p.resultsId, p.result);
  const ctx = useContextFor(p, { sensitivity, needed, multiplicity, separate });
  const banners = useMemo(() => (ctx ? resultBanners(ctx) : []), [ctx]);
  const chips = useMemo(() => (ctx ? resultChips(ctx) : []), [ctx]);
  const data = p.dataId ? project.sheets.find((s) => s.id === p.dataId) : undefined;
  // analyses that model the unit or the subject themselves do not ask
  const question = !!p.dataId && !p.readOnly && !shared
    && !UNIT_MODELLED.test(p.analysisId) && data?.kind === "data"
    && needsUnitQuestion(data);
  return { banners, chips, multiplicity, question };
}

