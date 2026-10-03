import { useEffect } from "react";
import { flushSync } from "react-dom";
import { isDarkMode } from "../lib/palette";
import { findSheet } from "../project/ops";
import { useProject } from "./context";

/**
 * Printing (Ctrl/Cmd+P or the Print commands) prints the selected sheet
 * only: the print stylesheet reads `data-print-kind` on <html> to keep
 * the data table, the results, the graph or the layout page and hide the
 * rest. Paper is white, so a dark theme switches to light for the
 * duration of the print (plots redraw in their light colours).
 */
export function usePrintSetup(): void {
  const { project, selectedId } = useProject();
  const kind = findSheet(project, selectedId)?.kind ?? "";

  useEffect(() => {
    document.documentElement.dataset.printKind = kind;
  }, [kind]);

  useEffect(() => {
    let restore: string | null = null;
    const root = document.documentElement;
    const before = () => {
      if (!isDarkMode()) return;
      restore = root.dataset.theme ?? "";
      flushSync(() => {
        root.dataset.theme = "light";
        window.dispatchEvent(new Event("opendose-theme"));
      });
    };
    const after = () => {
      if (restore === null) return;
      if (restore) root.dataset.theme = restore;
      else delete root.dataset.theme;
      restore = null;
      window.dispatchEvent(new Event("opendose-theme"));
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}

/** Select a sheet, let it render, then open the print dialog. */
export function printSheet(select: (id: string) => void, id: string): void {
  select(id);
  setTimeout(() => window.print(), 150);
}
