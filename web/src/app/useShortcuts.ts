import { useEffect } from "react";
import { useProject } from "./context";
import { useUi } from "./ui";

/** Project-wide keyboard shortcuts: undo / redo, and Ctrl/Cmd+K to go to
 *  any sheet. (Printing, Ctrl/Cmd+P, is handled in usePrint.) */
export function useShortcuts() {
  const { undo, redo } = useProject();
  const { openGoTo } = useUi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      // Inside an open dialog, leave text editing alone.
      if ((e.target as HTMLElement)?.closest?.("dialog")) return;
      if (k === "k" && !e.shiftKey) { e.preventDefault(); openGoTo(); }
      else if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || (k === "y" && !e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, openGoTo]);
}
