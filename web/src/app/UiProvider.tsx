import { useCallback, useMemo, useState, type ReactNode } from "react";
import ConfirmDialog, { type ConfirmOptions } from "../components/ConfirmDialog";
import DuplicateFamilyDialog from "../components/DuplicateFamilyDialog";
import NewTableDialog, { type NewTableRequest } from "../components/NewTableDialog";
import { newId } from "../project/ids";
import {
  duplicateFamily, familyChildren, familyRootId, findSheet,
} from "../project/ops";
import { tableDef } from "../sheets/registry";
import { useProject } from "./context";
import { addFamily, defaultTableName } from "./factory";
import { UiCtx, type UiApi } from "./ui";

type Dialog =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "newTable" }
  | { kind: "duplicateFamily"; rootId: string };

export function UiProvider({ children }: { children: ReactNode }) {
  const { project, apply, select, store } = useProject();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [navOpen, setNavOpenState] = useState(() => {
    try { return localStorage.getItem("opendose-nav") !== "closed"; } catch { return true; }
  });
  const setNavOpen = useCallback((open: boolean) => {
    setNavOpenState(open);
    // Only the wide-screen pane state is remembered; the drawer always
    // starts closed on narrow screens (see CSS).
    try { localStorage.setItem("opendose-nav", open ? "open" : "closed"); } catch { /* ignore */ }
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleNav = useCallback(() => {
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    if (narrow) setDrawerOpen((o) => !o);
    else setNavOpen(!navOpen);
  }, [navOpen, setNavOpen]);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setDialog({ kind: "confirm", opts, resolve });
  }), []);

  const openNewTable = useCallback(() => setDialog({ kind: "newTable" }), []);
  const openDuplicateFamily = useCallback((id: string) => {
    const root = familyRootId(store.project, id);
    if (root) setDialog({ kind: "duplicateFamily", rootId: root });
  }, [store]);

  const api = useMemo<UiApi>(() => ({
    confirm, openNewTable, openDuplicateFamily, navOpen, setNavOpen,
    drawerOpen, setDrawerOpen, toggleNav,
  }), [confirm, openNewTable, openDuplicateFamily, navOpen, setNavOpen,
    drawerOpen, toggleNav]);

  const createTable = (r: NewTableRequest) => {
    const def = tableDef(r.type);
    const table = r.sample && def.sampleTable ? def.sampleTable() : def.defaultTable(r.init);
    let dataId = "";
    apply((p) => {
      const res = addFamily(p, table, r.name, newId);
      dataId = res.dataId;
      return res.project;
    });
    setDialog(null);
    if (dataId) select(dataId);
  };

  let content: ReactNode = null;
  if (dialog?.kind === "confirm") {
    const d = dialog;
    content = <ConfirmDialog opts={d.opts} onDone={(ok) => { setDialog(null); d.resolve(ok); }} />;
  } else if (dialog?.kind === "newTable") {
    content = (
      <NewTableDialog defaultType={project.prefs.defaultTableType}
        defaultName={defaultTableName(project)}
        onCancel={() => setDialog(null)} onCreate={createTable} />
    );
  } else if (dialog?.kind === "duplicateFamily") {
    const root = findSheet(project, dialog.rootId);
    if (root) {
      content = (
        <DuplicateFamilyDialog tableName={root.name}
          childCount={familyChildren(project, root.id).length}
          onCancel={() => setDialog(null)}
          onDuplicate={(o) => {
            const before = new Set(store.project.sheets.map((s) => s.id));
            const next = apply((p) => duplicateFamily(p, root.id, o, newId));
            setDialog(null);
            const created = next.sheets.find((s) => !before.has(s.id) && s.kind === "data");
            if (created) select(created.id);
          }} />
      );
    }
  }

  return (
    <UiCtx.Provider value={api}>
      {children}
      {content}
    </UiCtx.Provider>
  );
}
