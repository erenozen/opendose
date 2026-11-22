// The live regions announce() writes into (Announcer.store.ts). Mounted
// once at the app root, by ToastProvider.
import { useEffect, useRef } from "react";
import { registerRegions } from "./Announcer.store";

export function Announcer() {
  const politeRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    registerRegions(politeRef.current, alertRef.current);
    return () => registerRegions(null, null);
  }, []);
  return (
    <div className="sr-only" data-announcer="">
      <div ref={politeRef} role="status" aria-live="polite" aria-relevant="additions" />
      <div ref={alertRef} role="alert" aria-live="assertive" aria-relevant="additions" />
    </div>
  );
}
