// React glue for the reporting package: the project's reporting
// preferences, the software label, and the commands that open the
// checklist, history and reporting-details dialogs (answered by
// <ReportHost>, mounted once in App).
import { useProject } from "../app/context";
import { APP_VERSION } from "../export/cite";
import { getRuntimeVersions } from "../lib/engine";
import { reportPrefsOf, type ReportPrefs } from "./prefs";

export function useReportPrefs(): ReportPrefs {
  const { project } = useProject();
  return reportPrefsOf(project.prefs);
}

/** "OpenDose 0.2.0 (SciPy 1.14.1, NumPy 2.0.2)" for legends. */
export function softwareLabel(): string {
  const v = getRuntimeVersions();
  return `OpenDose ${APP_VERSION}${v ? ` (SciPy ${v.scipy}, NumPy ${v.numpy})` : ""}`;
}

export const REPORT_EVENT = "opendose-report";

export type ReportRequest =
  | { kind: "checklist"; dataId?: string }
  | { kind: "history"; dataId?: string }
  | { kind: "details"; dataId: string }
  | { kind: "replicates"; dataId: string };

export function requestReport(req: ReportRequest): void {
  window.dispatchEvent(new CustomEvent<ReportRequest>(REPORT_EVENT, { detail: req }));
}

export const openChecklist = (dataId?: string) => requestReport({ kind: "checklist", dataId });
export const openHistory = (dataId?: string) => requestReport({ kind: "history", dataId });
export const openReportingDetails = (dataId: string) => requestReport({ kind: "details", dataId });
/** Opens the replicate assignment (sheets/common/ReplicateAssign.tsx). */
export const openAssignReplicates = (dataId: string) => requestReport({ kind: "replicates", dataId });
