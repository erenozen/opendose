// Shell UI services: dialogs and the navigator drawer.
import { createContext, useContext } from "react";
import type { ConfirmOptions } from "../components/ConfirmDialog";

export interface UiApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  openNewTable: () => void;
  openDuplicateFamily: (sheetId: string) => void;
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
