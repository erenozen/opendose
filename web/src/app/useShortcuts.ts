import { useEffect } from "react";
import { useCommands } from "./commands";
import { useProject } from "./context";
import { useUi } from "./ui";

/** Project-wide keyboard shortcuts: undo / redo, Ctrl/Cmd+K for the
 *  command palette and Ctrl/Cmd+S to save the project file (DECISIONS 5).
 *  (Ctrl/Cmd+O is in useFileOpen, printing, Ctrl/Cmd+P, in usePrint,
 *  Help, Ctrl/Cmd+/, in GuideProvider.) */
export function useShortcuts() {
  const { undo, redo } = useProject();
  const { openGoTo } = useUi();
  const { save } = useCommands();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      // Inside an open dialog, leave text editing alone.
      if ((e.target as HTMLElement)?.closest?.("dialog")) return;
      if (k === "k" && !e.shiftKey) { e.preventDefault(); openGoTo(); }
      else if (k === "s" && !e.shiftKey) { e.preventDefault(); save(); }
      else if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || (k === "y" && !e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, openGoTo, save]);
}
