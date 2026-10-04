// Answers the reporting commands (useReport.ts): journal checklists,
// history (provenance) and reporting details. Mounted once in App; the
// dialogs load on first use.
import { lazy, Suspense, useEffect, useState } from "react";
import { REPORT_EVENT, type ReportRequest } from "./useReport";

const ChecklistPanel = lazy(() => import("./ChecklistPanel"));
const HistoryPanel = lazy(() => import("./HistoryPanel"));
const DetailsDialog = lazy(() => import("./DetailsDialog"));
const AssignReplicatesDialog = lazy(() => import("../sheets/common/ReplicateAssign"));

export default function ReportHost() {
  const [req, setReq] = useState<ReportRequest | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReq((e as CustomEvent<ReportRequest>).detail);
    window.addEventListener(REPORT_EVENT, on);
    return () => window.removeEventListener(REPORT_EVENT, on);
  }, []);
  if (!req) return null;
  const close = () => setReq(null);
  return (
    <Suspense fallback={null}>
      {req.kind === "checklist" && <ChecklistPanel key={req.dataId ?? ""} dataId={req.dataId} onClose={close} />}
      {req.kind === "history" && <HistoryPanel key={req.dataId ?? ""} dataId={req.dataId} onClose={close} />}
      {req.kind === "details" && <DetailsDialog key={req.dataId} dataId={req.dataId} onClose={close} />}
      {req.kind === "replicates" && <AssignReplicatesDialog key={req.dataId} dataId={req.dataId} onClose={close} />}
    </Suspense>
  );
}
