import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ConfirmDialog, { type ConfirmOptions } from "../components/ConfirmDialog";
import DuplicateFamilyDialog from "../components/DuplicateFamilyDialog";
import GoToSheet from "../components/GoToSheet";
import NewTableDialog, { type NewTableRequest } from "../components/NewTableDialog";
import {
  GroupDialog, SaveTemplateDialog, WandDialog, type GroupChoice,
} from "../components/OrganiseDialogs";
import { addGroup, groupsOf, moveToGroup, nextGroupName } from "../project/groups";
import { newId } from "../project/ids";
import {
  duplicateFamily, familyChildren, familyRootId, findSheet,
} from "../project/ops";
import type { SheetTemplate } from "../project/templates";
import {
  isGroupSection, SECTION_LABELS, type DataSheet,
} from "../project/types";
import { wandCopy, wandSources } from "../project/wand";
import { tableDef } from "../sheets/registry";
import { useProject } from "./context";
import { addDerivedOutputs, addFamily, defaultTableName } from "./factory";
import { addTemplateFamily, downloadTemplate, makeTemplate, saveTemplate } from "./templates";
import { UiCtx, type UiApi } from "./ui";

type Dialog =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "newTable" }
  | { kind: "duplicateFamily"; rootId: string }
  | { kind: "saveTemplate"; rootId: string }
  | { kind: "wand"; dataId: string }
  | { kind: "group"; sheetId: string }
  | { kind: "goto" };

const RECENT_MAX = 12;

export function UiProvider({ children }: { children: ReactNode }) {
  const { project, apply, select, store, selectedId, setStatus } = useProject();
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

  // Narrow screens: whatever selects another sheet (a new table, a new
  // analysis, Go to sheet) closes the navigator drawer, so the drawer and
  // its scrim never cover the sheet that just opened.
  useEffect(() => { setDrawerOpen(false); }, [selectedId]);

  // Recently visited sheets, most recent first (for "Go to sheet").
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (!selectedId) return;
    setRecent((r) => (r[0] === selectedId ? r
      : [selectedId, ...r.filter((x) => x !== selectedId)].slice(0, RECENT_MAX)));
  }, [selectedId]);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setDialog({ kind: "confirm", opts, resolve });
  }), []);

  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setStatus(message);
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    notifyTimer.current = setTimeout(() => setStatus(""), 5000);
  }, [setStatus]);

  const openNewTable = useCallback(() => setDialog({ kind: "newTable" }), []);
  const openDuplicateFamily = useCallback((id: string) => {
    const root = familyRootId(store.project, id);
    if (root) setDialog({ kind: "duplicateFamily", rootId: root });
  }, [store]);
  const openSaveTemplate = useCallback((id: string) => {
    const root = familyRootId(store.project, id);
    if (root && findSheet(store.project, root)?.kind === "data") {
      setDialog({ kind: "saveTemplate", rootId: root });
    }
  }, [store]);
  const openWand = useCallback((id: string) => {
    if (findSheet(store.project, id)?.kind === "data") setDialog({ kind: "wand", dataId: id });
  }, [store]);
  const openMoveToGroup = useCallback((id: string) => {
    const s = findSheet(store.project, id);
    if (s && isGroupSection(s.kind)) setDialog({ kind: "group", sheetId: id });
  }, [store]);
  const openGoTo = useCallback(() => setDialog({ kind: "goto" }), []);

  const api = useMemo<UiApi>(() => ({
    confirm, openNewTable, openDuplicateFamily, openSaveTemplate, openWand,
    openMoveToGroup, openGoTo, notify, navOpen, setNavOpen,
    drawerOpen, setDrawerOpen, toggleNav,
  }), [confirm, openNewTable, openDuplicateFamily, openSaveTemplate, openWand,
    openMoveToGroup, openGoTo, notify, navOpen, setNavOpen, drawerOpen, toggleNav]);

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

  const createFromTemplate = (t: SheetTemplate, name: string, withData: boolean) => {
    let dataId = "";
    apply((p) => {
      const res = addTemplateFamily(p, t, name, newId, withData);
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
        onCancel={() => setDialog(null)} onCreate={createTable}
        onCreateFromTemplate={createFromTemplate} />
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
  } else if (dialog?.kind === "saveTemplate") {
    const root = findSheet(project, dialog.rootId);
    if (root) {
      content = (
        <SaveTemplateDialog tableName={root.name}
          childCount={familyChildren(project, root.id).length}
          onCancel={() => setDialog(null)}
          onSave={(o, download) => {
            const t = makeTemplate(store.project, root.id, o, newId);
            setDialog(null);
            if (!t) return;
            if (download) {
              downloadTemplate(t);
              notify(`Template “${t.name}” downloaded.`);
            } else {
              void saveTemplate(t).then((ok) => notify(ok
                ? `Template “${t.name}” saved. Use it from New data table › From a template.`
                : "This browser would not store the template; use Download file instead."));
            }
          }} />
      );
    }
  } else if (dialog?.kind === "wand") {
    const target = findSheet(project, dialog.dataId) as DataSheet | undefined;
    if (target?.kind === "data") {
      content = (
        <WandDialog project={project} target={target}
          sources={wandSources(project, target.id)}
          onCancel={() => setDialog(null)}
          onApply={(exampleId, prefix) => {
            let firstId = "";
            apply((p) => {
              const r = wandCopy(p, target.id, exampleId, newId, { prefix });
              firstId = r.created[0]?.id ?? "";
              return addDerivedOutputs(r.project, r.created, newId);
            });
            setDialog(null);
            if (firstId) select(firstId);
          }} />
      );
    }
  } else if (dialog?.kind === "group") {
    const s = findSheet(project, dialog.sheetId);
    if (s && isGroupSection(s.kind)) {
      const section = s.kind;
      content = (
        <GroupDialog sheetName={s.name} sectionLabel={SECTION_LABELS[section]}
          groups={groupsOf(project, section)} current={s.groupId ?? null}
          defaultNewName={nextGroupName(project, section)}
          onCancel={() => setDialog(null)}
          onMove={(c: GroupChoice) => {
            apply((p) => ("newName" in c
              ? addGroup(p, section, c.newName, newId, [s.id]).project
              : moveToGroup(p, s.id, c.groupId)));
            setDialog(null);
          }} />
      );
    }
  } else if (dialog?.kind === "goto") {
    content = (
      <GoToSheet project={project} recent={recent}
        onClose={() => setDialog(null)}
        onGo={(id) => { setDialog(null); select(id); setDrawerOpen(false); }} />
    );
  }

  return (
    <UiCtx.Provider value={api}>
      {children}
      {content}
    </UiCtx.Provider>
  );
}
