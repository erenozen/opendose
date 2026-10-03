import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommands } from "../app/commands";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import {
  familyChildren, familyIds, findSheet, setTitle, sortSection,
} from "../project/ops";
import {
  SECTION_LABELS, SECTION_ORDER, type Sheet, type SheetKind,
} from "../project/types";
import { derivedFrom } from "../project/derived";
import { LinkIcon } from "../sheets/manipulate/LinkIcon";
import { REGISTRY } from "../sheets/registry";
import SheetIcon, { SnowflakeIcon } from "./SheetIcon";
import SheetMenu, { type MenuAction } from "./SheetMenu";
import { printSheet } from "../app/usePrint";

const printKey = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform)
  ? "⌘P" : "Ctrl+P";

// One visible row of the tree, in display order.
interface Node {
  key: string;                // unique per row (a sheet can show twice)
  level: 1 | 2 | 3;
  section: SheetKind;
  sheet?: Sheet;              // undefined for section rows
  parentKey?: string;
  expandable: boolean;
  expanded: boolean;
}

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* ignore */ }
}

/**
 * The project navigator: every sheet, grouped into the five sections, with
 * each data table's results and graphs nested under it (its family).
 * Keyboard: arrows move, Right/Left expand/collapse, Enter selects, F2
 * renames, Delete deletes, Alt+Up/Down reorders, Shift+F10 opens the menu.
 */
export default function Navigator() {
  const { project, selectedId, select, apply } = useProject();
  const cmd = useCommands();
  const ui = useUi();
  const [query, setQuery] = useState("");
  const [collapsedSections, setCollapsedSections] =
    useState<Set<string>>(() => loadSet("opendose-nav-sections"));
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; id: string } | null>(null);
  const [menu, setMenu] = useState<{ id: string; key: string; at: { x: number; y: number } } | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);

  const q = query.trim().toLowerCase();
  const matches = useCallback((s: Sheet) => !q || s.name.toLowerCase().includes(q), [q]);
  const family = useMemo(() => new Set(selectedId ? familyIds(project, selectedId) : []),
    [project, selectedId]);

  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    for (const section of SECTION_ORDER) {
      const sheets = project.sheets.filter((s) => s.kind === section);
      let visible: Sheet[];
      if (section === "data") {
        visible = sheets.filter((s) => matches(s)
          || familyChildren(project, s.id).some(matches));
      } else {
        visible = sheets.filter(matches);
      }
      if (q && !visible.length) continue;
      const skey = `sec:${section}`;
      const expanded = !!q || !collapsedSections.has(section);
      out.push({ key: skey, level: 1, section, expandable: visible.length > 0, expanded });
      if (!expanded) continue;
      for (const s of visible) {
        const key = `${section}:${s.id}`;
        // A family lists its results and graphs, then the tables derived
        // from it (chains of analyses), which also have their own row.
        const kids = section === "data"
          ? [...familyChildren(project, s.id), ...derivedFrom(project, s.id)]
            .filter((k) => !q || matches(k) || matches(s)) : [];
        const fexp = !!q || !collapsedFamilies.has(s.id);
        out.push({
          key, level: 2, section, sheet: s, parentKey: skey,
          expandable: kids.length > 0, expanded: kids.length > 0 && fexp,
        });
        if (kids.length && fexp) {
          for (const k of kids) {
            out.push({
              key: `fam:${k.id}`, level: 3, section, sheet: k, parentKey: key,
              expandable: false, expanded: false,
            });
          }
        }
      }
    }
    return out;
  }, [project, q, matches, collapsedSections, collapsedFamilies]);

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
    if (n.level === 1) {
      setCollapsedSections((s) => {
        const next = new Set(s);
        if (want) next.delete(n.section); else next.add(n.section);
        saveSet("opendose-nav-sections", next);
        return next;
      });
    } else if (n.sheet) {
      const id = n.sheet.id;
      setCollapsedFamilies((s) => {
        const next = new Set(s);
        if (want) next.delete(id); else next.add(id);
        return next;
      });
    }
  };

  const choose = (n: Node) => {
    if (!n.sheet) { toggle(n); return; }
    select(n.sheet.id);
    setFocusKey(n.key);
    ui.setDrawerOpen(false);
  };

  const openMenu = (n: Node, at?: { x: number; y: number }) => {
    if (!n.sheet) return;
    let pos = at;
    if (!pos) {
      const row = treeRef.current?.querySelector<HTMLElement>(
        `[data-key="${CSS.escape(n.key)}"] > .nav-row`);
      const r = row?.getBoundingClientRect();
      pos = r ? { x: r.left + 24, y: r.bottom + 2 } : { x: 40, y: 40 };
    }
    setMenu({ id: n.sheet.id, key: n.key, at: pos });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-key]");
    if (!el || e.target !== el) return; // keys inside rename inputs etc.
    const i = nodes.findIndex((n) => n.key === el.dataset.key);
    const n = nodes[i];
    if (!n) return;
    const k = e.key;
    if (k === "ArrowDown" && e.altKey && n.sheet) {
      e.preventDefault(); cmd.move(n.sheet.id, 1); focusNode(n.key);
    } else if (k === "ArrowUp" && e.altKey && n.sheet) {
      e.preventDefault(); cmd.move(n.sheet.id, -1); focusNode(n.key);
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
    } else if (k === "F2" && n.sheet) {
      e.preventDefault(); setRenaming({ key: n.key, id: n.sheet.id });
    } else if ((k === "Delete" || k === "Backspace") && n.sheet) {
      e.preventDefault(); void cmd.remove(n.sheet.id);
    } else if ((k === "F10" && e.shiftKey) || k === "ContextMenu") {
      e.preventDefault(); openMenu(n);
    }
  };

  // Return focus to the row after a rename ends.
  const endRename = (key: string) => {
    setRenaming(null);
    focusNode(key);
  };

  const menuSheet = menu ? findSheet(project, menu.id) : undefined;
  const menuActions = (s: Sheet): (MenuAction | "sep")[] => {
    const inFamily = s.kind === "data" || s.kind === "results" || s.kind === "graph";
    const dataId = s.kind === "data" ? s.id
      : s.kind === "results" || s.kind === "graph" ? s.parentId : null;
    const data = dataId ? findSheet(project, dataId) : undefined;
    const analyses = data?.kind === "data" ? REGISTRY[data.table.type].analyses : [];
    const list: (MenuAction | "sep")[] = [
      { label: "Rename", shortcut: "F2", run: () => setRenaming({ key: menu!.key, id: s.id }) },
      { label: "Duplicate sheet", run: () => cmd.duplicate(s.id) },
    ];
    if (inFamily) {
      list.push({ label: "Duplicate family…", run: () => ui.openDuplicateFamily(s.id) });
    }
    if (dataId && analyses.length) {
      list.push("sep");
      for (const a of analyses) {
        list.push({ label: `Analyze: ${a.short}`, run: () => cmd.addAnalysis(dataId, a.id) });
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

  const renderRows = (parent: string | undefined, level: 1 | 2 | 3): React.ReactNode[] =>
    nodes.filter((n) => n.parentKey === parent && n.level === level).map((n) => {
      const s = n.sheet;
      const selected = !!s && s.id === selectedId;
      const kids = n.expanded ? renderRows(n.key, (level + 1) as 2 | 3) : [];
      const parentName = s && (s.kind === "results" || s.kind === "graph") && n.level === 2
        ? findSheet(project, s.parentId)?.name : undefined;
      // Under its own table, "Nonlin fit of Dose response" reads as
      // "Nonlin fit": the family already says which table.
      const ownerName = s && n.level === 3 && (s.kind === "results" || s.kind === "graph")
        ? findSheet(project, s.parentId)?.name : undefined;
      const shown = s ? (ownerName && s.name.endsWith(` of ${ownerName}`)
        ? s.name.slice(0, -(` of ${ownerName}`).length) : s.name) : "";
      const typeTag = s?.kind === "data" ? REGISTRY[s.table.type].short : undefined;
      return (
        <li key={n.key} role="treeitem" data-key={n.key}
          aria-level={n.level}
          aria-expanded={n.expandable ? n.expanded : undefined}
          aria-selected={s ? selected : undefined}
          aria-label={s ? `${s.name}${s.frozen ? " (frozen)" : ""}${
            s.kind === "data" && s.derived ? " (linked)" : ""}` : SECTION_LABELS[n.section]}
          tabIndex={n.key === tabKey ? 0 : -1}
          className={`nav-item level-${n.level}${selected ? " selected" : ""}${
            s && family.has(s.id) && !selected ? " in-family" : ""}`}
          onFocus={(e) => { if (e.target === e.currentTarget) setFocusKey(n.key); }}
          onKeyDown={onKeyDown}>
          <div className={`nav-row${s?.highlight ? ` hl-row hl-${s.highlight}` : ""}`}
            onClick={() => choose(n)}
            onDoubleClick={() => { if (s) setRenaming({ key: n.key, id: s.id }); }}
            onContextMenu={(e) => {
              if (!s) return;
              e.preventDefault();
              openMenu(n, { x: e.clientX, y: e.clientY });
            }}>
            {n.expandable ? (
              <span className={`twisty${n.expanded ? " open" : ""}`} aria-hidden="true"
                onClick={(e) => { e.stopPropagation(); toggle(n); }} />
            ) : <span className="twisty-space" aria-hidden="true" />}
            {s ? <SheetIcon kind={s.kind} /> : null}
            {s?.kind === "data" && s.derived && (
              <span className="nav-link" title="Linked: computed from another table">
                <LinkIcon /><span className="sr-only">linked</span>
              </span>
            )}
            {s && renaming?.key === n.key ? (
              <RenameInput initial={s.name}
                onDone={(name) => {
                  if (name !== null && name.trim() && name !== s.name) cmd.rename(s.id, name);
                  endRename(n.key);
                }} />
            ) : (
              <span className={s ? "nav-name" : "nav-section"} title={s?.name}>
                {s ? shown : SECTION_LABELS[n.section]}
                {parentName && !s!.name.includes(parentName) && (
                  <span className="nav-sub"> · {parentName}</span>
                )}
              </span>
            )}
            {!s && (
              <span className="nav-count" aria-hidden="true">
                {project.sheets.filter((x) => x.kind === n.section).length || ""}
              </span>
            )}
            {typeTag && <span className="nav-tag" title={`${REGISTRY[(s as Extract<Sheet, { kind: "data" }>).table.type].label} table`}>{typeTag}</span>}
            {s?.frozen && (
              <span className="nav-frozen" title="Frozen (read-only)">
                <SnowflakeIcon /><span className="sr-only">frozen</span>
              </span>
            )}
            {s && (
              <button type="button" className="nav-more" tabIndex={-1}
                aria-label={`Actions for ${s.name}`}
                onClick={(e) => { e.stopPropagation(); openMenu(n); }}>⋯</button>
            )}
          </div>
          {kids.length > 0 && <ul role="group">{kids}</ul>}
          {!s && n.expanded && !kids.length && !q && (
            <div className="nav-empty">None yet</div>
          )}
        </li>
      );
    });

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
      </div>
      <input className="nav-search" type="search" placeholder="Search sheets"
        aria-label="Search sheets" value={query}
        onChange={(e) => setQuery(e.target.value)} />
      <ul className="nav-tree" role="tree" aria-label="Sheets" ref={treeRef}>
        {renderRows(undefined, 1)}
      </ul>
      {q && !nodes.length && <p className="nav-empty">No sheet matches “{query}”.</p>}
      {menu && menuSheet && (
        <SheetMenu sheet={menuSheet} at={menu.at} actions={menuActions(menuSheet)}
          onHighlight={(c) => cmd.highlight(menuSheet.id, c)}
          onClose={(refocus) => {
            const key = menu.key;
            setMenu(null);
            if (refocus) focusNode(key);
          }} />
      )}
    </aside>
  );
}

function RenameInput({ initial, onDone }: {
  initial: string;
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
    <input className="nav-rename" autoFocus value={v} aria-label="Sheet name"
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
