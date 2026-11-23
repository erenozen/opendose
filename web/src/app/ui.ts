// Shell UI services: dialogs, the navigator drawer and notifications.
import { createContext, useContext } from "react";
import type { ConfirmOptions } from "../components/ConfirmDialog";
import type { ToastOptions } from "../components/ui/Toast.store";

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
  /** Reports an event as a toast (DECISIONS 6). `tone`: success, info,
   *  error (stays until dismissed) or progress (resolve it in place by
   *  showing the same `id` again); without a tone, a message starting
   *  "Could not" or "Failed" is an error, anything else info. `action`
   *  is one next step (Undo, Choose another file). Returns the id. */
  notify: (message: string, opts?: ToastOptions) => string;
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
