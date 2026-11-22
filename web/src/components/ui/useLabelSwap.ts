// The state of a label swap (LabelSwap.tsx): swapped for SWAP_MS after
// flash(), which also speaks the outcome once, politely.
import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "./Announcer.store";

export const SWAP_MS = 2000;

export function useLabelSwap(): { swapped: boolean; flash: (spoken: string) => void } {
  const [swapped, setSwapped] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = useCallback((spoken: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSwapped(true);
    announce(spoken, "polite");
    timer.current = setTimeout(() => setSwapped(false), SWAP_MS);
  }, []);
  return { swapped, flash };
}

