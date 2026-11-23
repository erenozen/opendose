// Mounted once in App: opens "Compare two event rates" when asked
// (./events). The dialog loads on first use.
import { lazy, Suspense, useEffect, useState } from "react";
import { onRatesRequest } from "./events";

const RatesDialog = lazy(() => import("./RatesDialog"));

export default function RatesHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => onRatesRequest(() => setOpen(true)), []);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <RatesDialog onClose={() => setOpen(false)} />
    </Suspense>
  );
}
