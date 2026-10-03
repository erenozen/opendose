// Shell UI services: dialogs and the navigator drawer.
import { createContext, useContext } from "react";
import type { ConfirmOptions } from "../components/ConfirmDialog";

export interface UiApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  openNewTable: () => void;
  openDuplicateFamily: (sheetId: string) => void;
  /** Save a family (of any of its sheets) as a template. */
  openSaveTemplate: (sheetId: string) => void;
  /** "Analyze and graph like…" for a data table. */
  openWand: (dataId: string) => void;
  /** Move a sheet into a group (or a new one, or none). */
  openMoveToGroup: (sheetId: string) => void;
  /** "Go to sheet" quick search (Ctrl/Cmd+K). */
  openGoTo: () => void;
  /** Short status message (saved, copied, ...). */
  notify: (message: string) => void;
  /** Wide screens: navigator pane shown (remembered). */
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  /** Narrow screens: navigator drawer open (never remembered). */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** Toggle whichever of the two applies at the current width. */
  toggleNav: () => void;
}

export const UiCtx = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const v = useContext(UiCtx);
  if (!v) throw new Error("useUi outside UiProvider");
  return v;
}
