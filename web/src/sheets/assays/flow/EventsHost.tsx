// Mounted once in App: opens the flow event-count calculator when the
// command palette or the flow wizard asks for it (openFlowEvents); the
// calculator itself loads on first use.
import { lazy, Suspense, useEffect, useState } from "react";
import { onFlowEventsRequest } from "./eventsModel";

const EventCalculator = lazy(() => import("./EventCalculator"));

export default function FlowEventsHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => onFlowEventsRequest(() => setOpen(true)), []);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <EventCalculator onClose={() => setOpen(false)} />
    </Suspense>
  );
}
