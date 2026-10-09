// Mounted once in App: opens the power and sample size tool when the
// header's Tools menu (or anything else) asks for it (./events).
import { lazy, Suspense, useEffect, useState } from "react";
import { onPowerRequest, type PowerRequest } from "./events";

const PowerDialog = lazy(() => import("./PowerDialog"));

export default function PowerHost() {
  const [req, setReq] = useState<PowerRequest | null>(null);
  useEffect(() => onPowerRequest(setReq), []);
  if (!req) return null;
  return (
    <Suspense fallback={null}>
      <PowerDialog initial={req.tab} pilot={req.pilot} onClose={() => setReq(null)} />
    </Suspense>
  );
}
