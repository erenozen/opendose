import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommands } from "../app/commands";
import { focusNote } from "../app/noteFocus";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import { findGroup, groupsOf, setGroupCollapsed } from "../project/groups";
import { allNotes, deleteNote, noteTitle, notesOf } from "../project/notes";
import {
  familyChildren, familyIds, findSheet, setTitle, sortSection,
} from "../project/ops";
import {
  isGroupSection, SECTION_LABELS, SECTION_ORDER, type FloatingNote, type GraphSheet,
  type Sheet, type SheetGroup, type SheetKind,
} from "../project/types";
import { derivedFrom } from "../project/derived";
import { wandSources } from "../project/wand";
import { LinkIcon } from "../sheets/manipulate/LinkIcon";
import { REGISTRY } from "../sheets/registry";
import SheetIcon, { FolderIcon, NoteIcon, SnowflakeIcon } from "./SheetIcon";
import SheetMenu, { type MenuAction } from "./SheetMenu";
import { printSheet } from "../app/usePrint";

const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
const printKey = mac ? "⌘P" : "Ctrl+P";
const goKey = mac ? "⌘K" : "Ctrl+K";

type NodeKind = "section" | "group" | "sheet" | "notes" | "note";

// One visible row of the tree, in display order.
interface Node {
  key: string;                // unique per row (a sheet can show twice)
  level: 1 | 2 | 3 | 4;
  section: SheetKind;
  kind: NodeKind;
  sheet?: Sheet;              // sheet rows
  group?: SheetGroup;         // group rows
  note?: { sheet: Sheet; note: FloatingNote };  // note rows
  /** A family member listed under its data table. */
  child?: boolean;
  parentKey?: string;
  expandable: boolean;
  expanded: boolean;
}

type Renaming = { key: string; id: string; group?: boolean };
type Drop = { key: string; mode: "into" | "before" };

const DRAG_TYPE = "application/x-opendose-sheet";

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* ignore */ }
}

/**
 * The project navigator: every sheet, grouped into the five sections, with
 * each data table's info sheets, results and graphs nested under it (its
 * family), user-defined groups inside the Data tables / Results / Graphs
 * sections, and the project's floating notes under Info.
 * Keyboard: arrows move, Right/Left expand/collapse, Enter selects, F2
 * renames, Delete deletes, Alt+Up/Down reorders, Shift+F10 opens the menu,
 * * expands everything and - collapses everything.
 */
export default function Navigator() {
  const { project, selectedId, select, apply, store } = useProject();
  const cmd = useCommands();
  const ui = useUi();
  const [query, setQuery] = useState("");
  const [collapsedSections, setCollapsedSections] =
    useState<Set<string>>(() => loadSet("opendose-nav-sections"));
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [notesOpen, setNotesOpen] = useState(true);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const [menu, setMenu] = useState<{ key: string; at: { x: number; y: number } } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dragId = useRef<string | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);

  const q = query.trim().toLowerCase();
  const matches = useCallback((s: Sheet) => !q || s.name.toLowerCase().includes(q)
    || notesOf(s).some((n) => n.text.toLowerCase().includes(q)), [q]);
  const family = useMemo(() => new Set(selectedId ? familyIds(project, selectedId) : []),
    [project, selectedId]);

  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    const kidsOf = (s: Sheet): Sheet[] => (s.kind === "data" ? [
      ...project.sheets.filter((x) => x.kind === "info" && x.parentId === s.id),
      ...familyChildren(project, s.id), ...derivedFrom(project, s.id),
    ] : []);
    const pushSheet = (s: Sheet, level: 2 | 3, parentKey: string, section: SheetKind) => {
      const key = `${section}:${s.id}`;
      // A family lists its info sheets, results and graphs, then the
      // tables derived from it (chains of analyses), which also have
      // their own row.
      const kids = kidsOf(s).filter((k) => !q || matches(k) || matches(s));
      const fexp = !!q || !collapsedFamilies.has(s.id);
      out.push({
        key, level, section, kind: "sheet", sheet: s, parentKey,
        expandable: kids.length > 0, expanded: kids.length > 0 && fexp,
      });
      if (kids.length && fexp) {
        for (const k of kids) {
          out.push({
            key: `fam:${k.id}`, level: (level + 1) as 3 | 4, section, kind: "sheet", sheet: k,
            child: true, parentKey: key, expandable: false, expanded: false,
          });
        }
      }
    };
    for (const section of SECTION_ORDER) {
      const sheets = project.sheets.filter((s) => s.kind === section);
      const visible = section === "data"
        ? sheets.filter((s) => matches(s) || kidsOf(s).some(matches))
        : sheets.filter(matches);
      const groups = isGroupSection(section) ? groupsOf(project, section) : [];
      const notes = section === "info" ? allNotes(project).filter(({ sheet, note }) => !q
        || note.text.toLowerCase().includes(q) || sheet.name.toLowerCase().includes(q)) : [];
      const any = visible.length > 0 || (!q && groups.length > 0) || notes.length > 0;
      if (q && !any) continue;
      const skey = `sec:${section}`;
      const expanded = !!q || !collapsedSections.has(section);
      out.push({ key: skey, level: 1, section, kind: "section", expandable: any, expanded });
      if (!expanded) continue;
      const groupIds = new Set(groups.map((g) => g.id));
      for (const g of groups) {
        const members = visible.filter((s) => s.groupId === g.id);
        if (q && !members.length) continue;
        const gkey = `grp:${g.id}`;
        const gexp = !!q || !g.collapsed;
        out.push({
          key: gkey, level: 2, section, kind: "group", group: g, parentKey: skey,
          expandable: true, expanded: gexp,
        });
        if (gexp) for (const s of members) pushSheet(s, 3, gkey, section);
      }
      for (const s of visible) {
        if (s.groupId && groupIds.has(s.groupId)) continue;
        pushSheet(s, 2, skey, section);
      }
      if (notes.length) {
        const nkey = "notes:all";
        const nexp = !!q || notesOpen;
        out.push({
          key: nkey, level: 2, section, kind: "notes", parentKey: skey,
          expandable: true, expanded: nexp,
        });
        if (nexp) {
          for (const n of notes) {
            out.push({
              key: `note:${n.sheet.id}:${n.note.id}`, level: 3, section, kind: "note", note: n,
              parentKey: nkey, expandable: false, expanded: false,
            });
          }
        }
      }
    }
    return out;
  }, [project, q, matches, collapsedSections, collapsedFamilies, notesOpen]);

  // Roving focus target: the focused row if still visible, else the
  // selected sheet's first row, else the first row.
  const tabKey = (focusKey && nodes.some((n) => n.key === focusKey)) ? focusKey
    : nodes.find((n) => n.sheet?.id === selectedId)?.key ?? nodes[0]?.key;

  const focusNode = (key: string | undefined) => {
    if (!key) return;
    setFocusKey(key);
    requestAnimationFrame(() => {
      treeRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
    });
  };

  const toggle = (n: Node, open?: boolean) => {
    if (!n.expandable) return;
    const want = open ?? !n.expanded;
    if (n.kind === "section") {
      setCollapsedSections((s) => {
        const next = new Set(s);
        if (want) next.delete(n.section); else next.add(n.section);
        saveSet("opendose-nav-sections", next);
        return next;
      });
    } else if (n.kind === "group" && n.group) {
      cmd.setGroupFolded(n.group.id, !want);
    } else if (n.kind === "notes") {
      setNotesOpen(want);
    } else if (n.sheet) {
      const id = n.sheet.id;
      setCollapsedFamilies((s) => {
        const next = new Set(s);
        if (want) next.delete(id); else next.add(id);
        return next;
      });
    }
  };

  /** Collapse or expand every section, group and family. */
  const setAll = (open: boolean) => {
    const sections = open ? new Set<string>() : new Set<string>(SECTION_ORDER);
    setCollapsedSections(sections);
    saveSet("opendose-nav-sections", sections);
    setCollapsedFamilies(open ? new Set()
      : new Set(project.sheets.filter((s) => s.kind === "data").map((s) => s.id)));
    setNotesOpen(open);
    store.patchAll((p) => groupsOf(p).reduce((acc, g) => setGroupCollapsed(acc, g.id, !open), p));
  };

  const choose = (n: Node) => {
    if (n.kind === "note" && n.note) {
      select(n.note.sheet.id);
      setFocusKey(n.key);
      ui.setDrawerOpen(false);
      focusNote(n.note.note.id);
      return;
    }
    if (!n.sheet) { toggle(n); return; }
    select(n.sheet.id);
    setFocusKey(n.key);
    ui.setDrawerOpen(false);
  };

  const openMenu = (n: Node, at?: { x: number; y: number }) => {
    if (n.kind === "notes") return;
    let pos = at;
    if (!pos) {
      const row = treeRef.current?.querySelector<HTMLElement>(
        `[data-key="${CSS.escape(n.key)}"] > .nav-row`);
      const r = row?.getBoundingClientRect();
      pos = r ? { x: r.left + 24, y: r.bottom + 2 } : { x: 40, y: 40 };
    }
    setMenu({ key: n.key, at: pos });
  };

  const startRename = (n: Node) => {
    if (n.sheet) setRenaming({ key: n.key, id: n.sheet.id });
    else if (n.group) setRenaming({ key: n.key, id: n.group.id, group: true });
  };

  const removeNode = (n: Node) => {
    if (n.kind === "group" && n.group) cmd.deleteGroup(n.group.id);
    else if (n.kind === "note" && n.note) {
      const { sheet, note } = n.note;
      apply((p) => deleteNote(p, sheet.id, note.id));
    } else if (n.sheet) void cmd.remove(n.sheet.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-key]");
    if (!el || e.target !== el) return; // keys inside rename inputs etc.
    const i = nodes.findIndex((n) => n.key === el.dataset.key);
    const n = nodes[i];
    if (!n) return;
    const k = e.key;
    const movable = (n.kind === "sheet" && !n.child) || n.kind === "group";
    const reorder = (dir: -1 | 1) => {
      if (n.kind === "group" && n.group) cmd.moveGroup(n.group.id, dir);
      else if (n.sheet) cmd.move(n.sheet.id, dir);
      focusNode(n.key);
    };
    if (k === "ArrowDown" && e.altKey && (movable || n.sheet)) {
      e.preventDefault(); reorder(1);
    } else if (k === "ArrowUp" && e.altKey && (movable || n.sheet)) {
      e.preventDefault(); reorder(-1);
    } else if (k === "ArrowDown") {
      e.preventDefault(); focusNode(nodes[Math.min(i + 1, nodes.length - 1)]?.key);
    } else if (k === "ArrowUp") {
      e.preventDefault(); focusNode(nodes[Math.max(i - 1, 0)]?.key);
    } else if (k === "Home") {
      e.preventDefault(); focusNode(nodes[0]?.key);
    } else if (k === "End") {
      e.preventDefault(); focusNode(nodes[nodes.length - 1]?.key);
    } else if (k === "ArrowRight") {
      e.preventDefault();
      if (n.expandable && !n.expanded) toggle(n, true);
      else if (n.expandable) focusNode(nodes[i + 1]?.key);
    } else if (k === "ArrowLeft") {
      e.preventDefault();
      if (n.expandable && n.expanded) toggle(n, false);
      else if (n.parentKey) focusNode(n.parentKey);
    } else if (k === "Enter" || k === " ") {
      e.preventDefault(); choose(n);
    } else if (k === "F2" && (n.sheet || n.group)) {
      e.preventDefault(); startRename(n);
    } else if ((k === "Delete" || k === "Backspace") && (n.sheet || n.group || n.note)) {
      e.preventDefault(); removeNode(n);
    } else if ((k === "F10" && e.shiftKey) || k === "ContextMenu") {
      e.preventDefault(); openMenu(n);
    } else if (k === "*") {
      e.preventDefault(); setAll(true);
    } else if (k === "-" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); setAll(false); focusNode(`sec:${n.section}`);
    }
  };

  // Return focus to the row after a rename ends.
  const endRename = (key: string) => {
    setRenaming(null);
    focusNode(key);
  };

  // ---- drag and drop: reorder sheets, move them into / out of groups
  const dropFor = (n: Node, kind: SheetKind): Drop["mode"] | null => {
    if (n.kind === "group" && n.group) return n.group.section === kind ? "into" : null;
    if (n.kind === "section") return n.section === kind && isGroupSection(kind) ? "into" : null;
    if (n.kind === "sheet" && !n.child && n.sheet && n.sheet.kind === kind
      && n.sheet.id !== dragId.current) return "before";
    return null;
  };
  const draggedKind = () => findSheet(project, dragId.current)?.kind;
  const onDrop = (n: Node) => {
    const id = dragId.current;
    dragId.current = null;
    setDrop(null);
    if (!id) return;
    if (n.kind === "group" && n.group) cmd.toGroup(id, n.group.id);
    else if (n.kind === "section") cmd.toGroup(id, null);
    else if (n.sheet) cmd.dropBefore(id, n.sheet.id);
  };

  const menuNode = menu ? nodes.find((n) => n.key === menu.key) : undefined;

  const sheetActions = (s: Sheet, key: string): (MenuAction | "sep")[] => {
    const inFamily = s.kind === "data" || s.kind === "results" || s.kind === "graph";
    const dataId = s.kind === "data" ? s.id
      : s.kind === "results" || s.kind === "graph" ? s.parentId : null;
    const data = dataId ? findSheet(project, dataId) : undefined;
    const analyses = data?.kind === "data" ? REGISTRY[data.table.type].analyses : [];
    const graphs = s.kind === "data"
      ? familyChildren(project, s.id).filter((c): c is GraphSheet => c.kind === "graph") : [];
    const list: (MenuAction | "sep")[] = [
      { label: "Rename", shortcut: "F2", run: () => setRenaming({ key, id: s.id }) },
      { label: "Duplicate sheet", run: () => cmd.duplicate(s.id) },
    ];
    if (inFamily) {
      list.push({ label: "Duplicate family…", run: () => ui.openDuplicateFamily(s.id) });
    }
    if (inFamily && data?.kind === "data") {
      list.push({ label: "Save family as template…", run: () => cmd.saveTemplate(s.id) });
    }
    if (s.kind === "data") {
      list.push({
        label: "Analyze and graph like…", disabled: !wandSources(project, s.id).length,
        run: () => cmd.wand(s.id),
      });
    }
    if (s.kind === "graph" || graphs.length) {
      list.push({
        label: s.kind === "graph" ? "Apply this format to graphs of this kind…"
          : "Apply these graph formats to graphs of the same kind…",
        run: () => void cmd.makeConsistent(s.id),
      });
    }
    if (dataId && analyses.length) {
      list.push("sep");
      for (const a of analyses) {
        list.push({ label: `Analyze: ${a.short}`, run: () => cmd.addAnalysis(dataId, a.id) });
      }
    }
    list.push("sep",
      { label: "Add floating note", run: () => {
        select(s.id);
        const id = cmd.addNote(s.id);
        if (id) focusNote(id);
      } });
    if (isGroupSection(s.kind)) {
      list.push({ label: "Move to group…", run: () => cmd.moveToGroup(s.id) });
      if (s.groupId && findGroup(project, s.groupId)) {
        list.push({ label: "Remove from group", run: () => cmd.toGroup(s.id, null) });
      }
    }
    list.push("sep",
      { label: "Move up", shortcut: "Alt+↑", run: () => cmd.move(s.id, -1) },
      { label: "Move down", shortcut: "Alt+↓", run: () => cmd.move(s.id, 1) },
      { label: `Sort ${SECTION_LABELS[s.kind].toLowerCase()} by name`,
        run: () => apply((p) => sortSection(p, s.kind)) },
      { label: s.frozen ? "Unfreeze" : "Freeze", run: () => cmd.toggleFreeze(s.id) },
      { label: "Print…", shortcut: printKey, run: () => printSheet(select, s.id) },
      "sep",
      { label: s.kind === "data" ? "Delete family…" : "Delete…", shortcut: "Del",
        danger: true, run: () => void cmd.remove(s.id) },
    );
    return list;
  };

  const nodeActions = (n: Node): (MenuAction | "sep")[] => {
    if (n.kind === "sheet" && n.sheet) return sheetActions(n.sheet, n.key);
    if (n.kind === "group" && n.group) {
      const g = n.group;
      return [
        { label: "Rename group", shortcut: "F2", run: () => setRenaming({ key: n.key, id: g.id, group: true }) },
        { label: g.collapsed ? "Expand" : "Collapse", run: () => cmd.setGroupFolded(g.id, !g.collapsed) },
        "sep",
        { label: "Move group up", shortcut: "Alt+↑", run: () => cmd.moveGroup(g.id, -1) },
        { label: "Move group down", shortcut: "Alt+↓", run: () => cmd.moveGroup(g.id, 1) },
        "sep",
        { label: "Delete group (keep its sheets)", shortcut: "Del", danger: true,
          run: () => cmd.deleteGroup(g.id) },
      ];
    }
    if (n.kind === "note" && n.note) {
      const { sheet, note } = n.note;
      return [
        { label: "Open note", run: () => choose(n) },
        { label: "Delete note", shortcut: "Del", danger: true,
          run: () => apply((p) => deleteNote(p, sheet.id, note.id)) },
      ];
    }
    const list: (MenuAction | "sep")[] = [];
    if (isGroupSection(n.section)) {
      const section = n.section;
      list.push({
        label: "New group", run: () => {
          const id = cmd.newGroup(section);
          setCollapsedSections((s) => {
            if (!s.has(section)) return s;
            const next = new Set(s);
            next.delete(section);
            return next;
          });
          if (id) {
            const key = `grp:${id}`;
            setFocusKey(key);
            setRenaming({ key, id, group: true });
          }
        },
      });
    }
    list.push(
      { label: `Sort ${SECTION_LABELS[n.section].toLowerCase()} by name`,
        run: () => apply((p) => sortSection(p, n.section)) },
      "sep",
      { label: "Collapse all", shortcut: "−", run: () => setAll(false) },
      { label: "Expand all", shortcut: "*", run: () => setAll(true) },
    );
    return list;
  };

  // Drawer (narrow screens): focus moves into it on open; Escape closes it.
  const drawerOpen = ui.drawerOpen;
  const focusRef = useRef<() => void>(() => {});
  focusRef.current = () => focusNode(tabKey);
  useEffect(() => {
    if (drawerOpen) focusRef.current();
  }, [drawerOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || menu || renaming) return;
      ui.setDrawerOpen(false);
      document.querySelector<HTMLElement>(".nav-toggle")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, menu, renaming, ui]);

  // Keep the selected sheet visible: expand its section and family.
  useEffect(() => {
    const s = findSheet(project, selectedId);
    if (!s) return;
    setCollapsedSections((cur) => (cur.has(s.kind) ? (() => {
      const next = new Set(cur);
      next.delete(s.kind);
      return next;
    })() : cur));
  }, [selectedId, project]);
  // ... and unfold its group when the selection moves to it.
  const unfoldRef = useRef(cmd.setGroupFolded);
  unfoldRef.current = cmd.setGroupFolded;
  useEffect(() => {
    const p = store.project;
    const s = findSheet(p, selectedId);
    const g = findGroup(p, s?.groupId);
    if (g?.collapsed) unfoldRef.current(g.id, false);
  }, [selectedId, store]);

  const renderRows = (parent: string | undefined): React.ReactNode[] =>
    nodes.filter((n) => n.parentKey === parent).map((n) => {
      const s = n.sheet;
      const g = n.group;
      const selected = !!s && !n.note && s.id === selectedId;
      const kids = n.expanded ? renderRows(n.key) : [];
      const parentName = s && !n.child && (s.kind === "results" || s.kind === "graph"
        || (s.kind === "info" && s.parentId)) ? findSheet(project, s.parentId)?.name : undefined;
      // Under its own table, "Nonlin fit of Dose response" reads as
      // "Nonlin fit": the family already says which table.
      const ownerName = s && n.child && (s.kind === "results" || s.kind === "graph")
        ? findSheet(project, s.parentId)?.name : undefined;
      const shown = s ? (ownerName && s.name.endsWith(` of ${ownerName}`)
        ? s.name.slice(0, -(` of ${ownerName}`).length) : s.name) : "";
      const typeTag = s?.kind === "data" ? REGISTRY[s.table.type].short : undefined;
      const noteCount = s ? notesOf(s).length : 0;
      const memberCount = g ? project.sheets.filter((x) => x.groupId === g.id).length : 0;
      const label = s ? `${s.name}${s.frozen ? " (frozen)" : ""}${
        s.kind === "data" && s.derived ? " (linked)" : ""}`
        : g ? `${g.name} (group)`
          : n.kind === "notes" ? "Floating notes"
            : n.note ? `Note: ${noteTitle(n.note.note)} on ${n.note.sheet.name}`
              : SECTION_LABELS[n.section];
      const draggable = n.kind === "sheet" && !n.child && !renaming;
      const dropMode = drop?.key === n.key ? drop.mode : null;
      const hasMenu = n.kind !== "notes";
      return (
        <li key={n.key} role="treeitem" data-key={n.key}
          aria-level={n.level}
          aria-expanded={n.expandable ? n.expanded : undefined}
          aria-selected={s ? selected : undefined}
          aria-label={label}
          tabIndex={n.key === tabKey ? 0 : -1}
          className={`nav-item level-${n.level} nk-${n.kind}${n.child ? " nav-child" : ""}${
            selected ? " selected" : ""}${
            s && family.has(s.id) && !selected ? " in-family" : ""}`}
          onFocus={(e) => { if (e.target === e.currentTarget) setFocusKey(n.key); }}
          onKeyDown={onKeyDown}>
          <div className={`nav-row${s?.highlight ? ` hl-row hl-${s.highlight}` : ""}${
            dropMode ? ` drop-${dropMode}` : ""}`}
            draggable={draggable || undefined}
            onDragStart={draggable ? (e) => {
              dragId.current = s!.id;
              e.dataTransfer.setData(DRAG_TYPE, s!.id);
              e.dataTransfer.setData("text/plain", s!.name);
              e.dataTransfer.effectAllowed = "move";
            } : undefined}
            onDragEnd={() => { dragId.current = null; setDrop(null); }}
            onDragOver={(e) => {
              const kind = draggedKind();
              const mode = kind ? dropFor(n, kind) : null;
              if (!mode) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (drop?.key !== n.key || drop.mode !== mode) setDrop({ key: n.key, mode });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)
                && drop?.key === n.key) setDrop(null);
            }}
            onDrop={(e) => { e.preventDefault(); onDrop(n); }}
            onClick={() => choose(n)}
            onDoubleClick={() => { if (s || g) startRename(n); }}
            onContextMenu={(e) => {
              if (!hasMenu) return;
              e.preventDefault();
              openMenu(n, { x: e.clientX, y: e.clientY });
            }}>
            {n.expandable ? (
              <span className={`twisty${n.expanded ? " open" : ""}`} aria-hidden="true"
                onClick={(e) => { e.stopPropagation(); toggle(n); }} />
            ) : <span className="twisty-space" aria-hidden="true" />}
            {s ? <SheetIcon kind={s.kind} /> : g ? <FolderIcon open={n.expanded} />
              : n.kind === "notes" || n.note ? <NoteIcon /> : null}
            {s?.kind === "data" && s.derived && (
              <span className="nav-link" title="Linked: computed from another table">
                <LinkIcon /><span className="sr-only">linked</span>
              </span>
            )}
            {renaming?.key === n.key && (s || g) ? (
              <RenameInput initial={s ? s.name : g!.name} label={g ? "Group name" : "Sheet name"}
                onDone={(name) => {
                  if (name !== null && name.trim()) {
                    if (g && name !== g.name) cmd.renameGroup(g.id, name);
                    else if (s && name !== s.name) cmd.rename(s.id, name);
                  }
                  endRename(n.key);
                }} />
            ) : (
              <span className={n.kind === "section" ? "nav-section" : "nav-name"}
                title={s?.name ?? g?.name ?? n.note?.note.text.slice(0, 300)}>
                {s ? shown : g ? g.name : n.kind === "notes" ? "Floating notes"
                  : n.note ? noteTitle(n.note.note) : SECTION_LABELS[n.section]}
                {parentName && !s!.name.includes(parentName) && (
                  <span className="nav-sub"> · {parentName}</span>
                )}
                {n.note && <span className="nav-sub"> · {n.note.sheet.name}</span>}
              </span>
            )}
            {n.kind === "section" && (
              <span className="nav-count" aria-hidden="true">
                {project.sheets.filter((x) => x.kind === n.section).length || ""}
              </span>
            )}
            {(g || n.kind === "notes") && (
              <span className="nav-count" aria-hidden="true">
                {g ? memberCount : allNotes(project).length}
              </span>
            )}
            {n.note && <span className={`note-dot note-${n.note.note.color}`} aria-hidden="true" />}
            {noteCount > 0 && (
              <span className="nav-notes" title={`${noteCount} floating note${noteCount === 1 ? "" : "s"}`}>
                <NoteIcon /><span className="sr-only">{noteCount} notes</span>
              </span>
            )}
            {typeTag && <span className="nav-tag" title={`${REGISTRY[(s as Extract<Sheet, { kind: "data" }>).table.type].label} table`}>{typeTag}</span>}
            {s?.frozen && (
              <span className="nav-frozen" title="Frozen (read-only)">
                <SnowflakeIcon /><span className="sr-only">frozen</span>
              </span>
            )}
            {hasMenu && (
              <button type="button" className="nav-more" tabIndex={-1}
                aria-label={`Actions for ${s?.name ?? g?.name ?? (n.note ? "note" : SECTION_LABELS[n.section])}`}
                onClick={(e) => { e.stopPropagation(); openMenu(n); }}>⋯</button>
            )}
          </div>
          {kids.length > 0 && <ul role="group">{kids}</ul>}
          {n.kind === "section" && n.expanded && !kids.length && !q && (
            <div className="nav-empty">None yet</div>
          )}
          {n.kind === "group" && n.expanded && !kids.length && !q && (
            <div className="nav-empty nav-empty-group">
              Empty: drag sheets here, or use “Move to group…” in a sheet’s menu
            </div>
          )}
        </li>
      );
    });

  const selected = findSheet(project, selectedId);

  return (
    <aside className={`navigator${ui.navOpen ? "" : " nav-collapsed"}${ui.drawerOpen ? " drawer-open" : ""}`}
      aria-label="Project navigator">
      <div className="nav-head">
        <input className="nav-title" value={project.title}
          aria-label="Project title"
          onChange={(e) => apply((p) => setTitle(p, e.target.value), "title")} />
        <button type="button" className="nav-close" aria-label="Close navigator"
          onClick={() => ui.setDrawerOpen(false)}>✕</button>
      </div>
      <div className="nav-tools">
        <button type="button" className="btn-primary nav-new" aria-label="New data table"
          onClick={cmd.newTable}>+ Table</button>
        <button type="button" aria-label="New info sheet" onClick={cmd.addInfo}>+ Info</button>
        <button type="button" aria-label="New layout" onClick={cmd.addLayout}>+ Layout</button>
        <button type="button" aria-label="Add a floating note to the selected sheet"
          title="Add a floating note to the selected sheet" disabled={!selected}
          onClick={() => {
            if (!selected) return;
            const id = cmd.addNote(selected.id);
            if (id) focusNote(id);
          }}>+ Note</button>
      </div>
      <div className="nav-search-row">
        <input className="nav-search" type="search" placeholder="Search sheets and notes"
          aria-label="Search sheets and notes" value={query}
          title={`${goKey} jumps to any sheet`}
          onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="nav-icon-btn" aria-label="Collapse all"
          title="Collapse all (−)" onClick={() => setAll(false)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 2.5 7 5.5l3-3M4 11.5 7 8.5l3 3" />
          </svg>
        </button>
        <button type="button" className="nav-icon-btn" aria-label="Expand all"
          title="Expand all (*)" onClick={() => setAll(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5.5 7 2.5l3 3M4 8.5l3 3 3-3" />
          </svg>
        </button>
      </div>
      <ul className="nav-tree" role="tree" aria-label="Sheets" ref={treeRef}>
        {renderRows(undefined)}
      </ul>
      {q && !nodes.length && <p className="nav-empty">No sheet matches “{query}”.</p>}
      {menu && menuNode && (
        <SheetMenu sheet={menuNode.kind === "sheet" ? menuNode.sheet : undefined}
          label={menuNode.group?.name ?? (menuNode.note ? "note" : SECTION_LABELS[menuNode.section])}
          at={menu.at} actions={nodeActions(menuNode)}
          onHighlight={menuNode.kind === "sheet" && menuNode.sheet
            ? (c) => cmd.highlight(menuNode.sheet!.id, c) : undefined}
          onClose={(refocus) => {
            const key = menu.key;
            setMenu(null);
            if (refocus) focusNode(key);
          }} />
      )}
    </aside>
  );
}

function RenameInput({ initial, label, onDone }: {
  initial: string;
  label: string;
  onDone: (name: string | null) => void;
}) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input className="nav-rename" autoFocus value={v} aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); finish(v); }
        if (e.key === "Escape") { e.preventDefault(); finish(null); }
      }}
      onBlur={() => finish(v)} />
  );
}
