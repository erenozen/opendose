// User-defined sheet groups: named folders inside the Data tables,
// Results and Graphs sections of the navigator. A group is listed in
// `project.groups` (display order); a sheet belongs to one through its
// `groupId`. Groups never own sheets: deleting a group keeps them.
//
// Plain data + pure functions, like the rest of this folder.
import type { IdFactory } from "./ids.ts";
import {
  isGroupSection, type GroupSection, type Project, type Sheet, type SheetGroup,
} from "./types.ts";

export function groupsOf(p: Project, section?: GroupSection): SheetGroup[] {
  const all = p.groups ?? [];
  return section ? all.filter((g) => g.section === section) : all;
}

export function findGroup(p: Project, id: string | null | undefined): SheetGroup | undefined {
  return id ? (p.groups ?? []).find((g) => g.id === id) : undefined;
}

/** Sheets in a group, in project order. */
export function groupMembers(p: Project, groupId: string): Sheet[] {
  return p.sheets.filter((s) => s.groupId === groupId);
}

/** Can sheets of this kind go into a group of `section`? */
export function canGroup(s: Sheet, section: GroupSection): boolean {
  return s.kind === section;
}

/** "Group 1", "Group 2", ... first free name within a section. */
export function nextGroupName(p: Project, section: GroupSection, stem = "Group"): string {
  const taken = new Set(groupsOf(p, section).map((g) => g.name));
  for (let i = 1; ; i++) {
    const n = `${stem} ${i}`;
    if (!taken.has(n)) return n;
  }
}

/** Create a group (at the end of its section's groups) and optionally
 *  move sheets of the right kind into it. */
export function addGroup(p: Project, section: GroupSection, name: string,
  ids: IdFactory | string, sheetIds: string[] = []): { project: Project; groupId: string } {
  const id = typeof ids === "string" ? ids : ids();
  const group: SheetGroup = { id, section, name: name.trim() || nextGroupName(p, section) };
  let next: Project = { ...p, groups: [...(p.groups ?? []), group] };
  for (const sid of sheetIds) next = moveToGroup(next, sid, id);
  return { project: next, groupId: id };
}

function updateGroup(p: Project, id: string, fn: (g: SheetGroup) => SheetGroup): Project {
  let changed = false;
  const groups = (p.groups ?? []).map((g) => {
    if (g.id !== id) return g;
    const n = fn(g);
    if (n !== g) changed = true;
    return n;
  });
  return changed ? { ...p, groups } : p;
}

export function renameGroup(p: Project, id: string, name: string): Project {
  const clean = name.trim();
  if (!clean) return p;
  return updateGroup(p, id, (g) => (g.name === clean ? g : { ...g, name: clean }));
}

export function setGroupCollapsed(p: Project, id: string, collapsed: boolean): Project {
  return updateGroup(p, id, (g) => (!!g.collapsed === collapsed ? g
    : collapsed ? { ...g, collapsed: true } : withoutKey(g, "collapsed")));
}

/** Delete a group; its sheets stay, ungrouped. */
export function deleteGroup(p: Project, id: string): Project {
  if (!findGroup(p, id)) return p;
  return {
    ...p,
    groups: (p.groups ?? []).filter((g) => g.id !== id),
    sheets: p.sheets.map((s) => (s.groupId === id ? withoutKey(s, "groupId") : s)),
  };
}

/** Put a sheet into a group, or take it out (`groupId` null). A group of
 *  another section is refused. */
export function moveToGroup(p: Project, sheetId: string, groupId: string | null): Project {
  const g = groupId ? findGroup(p, groupId) : undefined;
  if (groupId && !g) return p;
  let changed = false;
  const sheets = p.sheets.map((s) => {
    if (s.id !== sheetId) return s;
    if (g && !canGroup(s, g.section)) return s;
    if ((s.groupId ?? null) === (groupId ?? null)) return s;
    changed = true;
    return groupId ? { ...s, groupId } : withoutKey(s, "groupId");
  });
  return changed ? { ...p, sheets } : p;
}

/** Move a group one place up / down among its section's groups. */
export function moveGroup(p: Project, id: string, dir: -1 | 1): Project {
  const g = findGroup(p, id);
  if (!g) return p;
  const all = p.groups ?? [];
  const peers = all.filter((x) => x.section === g.section);
  const other = peers[peers.indexOf(g) + dir];
  if (!other) return p;
  const groups = [...all];
  const a = all.indexOf(g);
  const b = all.indexOf(other);
  groups[a] = other;
  groups[b] = g;
  return { ...p, groups };
}

/** Move a sheet to just before another sheet of the same kind (drag and
 *  drop in the navigator); it joins that sheet's group. `beforeId` null
 *  moves it to the end of its kind. */
export function moveSheetBefore(p: Project, id: string, beforeId: string | null): Project {
  const s = p.sheets.find((x) => x.id === id);
  if (!s || id === beforeId) return p;
  const target = beforeId ? p.sheets.find((x) => x.id === beforeId) : undefined;
  if (beforeId && (!target || target.kind !== s.kind)) return p;
  const rest = p.sheets.filter((x) => x.id !== id);
  const moved: Sheet = target
    ? (target.groupId ? { ...s, groupId: target.groupId } : withoutKey(s, "groupId"))
    : s;
  let at: number;
  if (target) at = rest.indexOf(target);
  else {
    const lastSame = rest.findLastIndex((x) => x.kind === s.kind);
    at = lastSame + 1;
  }
  const sheets = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return sheets.every((x, i) => x === p.sheets[i]) ? p : { ...p, sheets };
}

/** Validate groups after loading a file: unknown sections, duplicate ids
 *  and empty names are fixed; sheets pointing at a missing group (or one
 *  of another section) are ungrouped. */
export function repairGroups(p: Project, raw: unknown = p.groups): Project {
  const seen = new Set<string>();
  const groups: SheetGroup[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id || seen.has(id) || !isGroupSection(o.section)) continue;
    seen.add(id);
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Group";
    groups.push({ id, section: o.section, name, ...(o.collapsed === true ? { collapsed: true } : {}) });
  }
  const bySection = new Map(groups.map((g) => [g.id, g.section]));
  const sheets = p.sheets.map((s) => {
    if (s.groupId === undefined) return s;
    const sec = bySection.get(s.groupId);
    return sec && sec === s.kind ? s : withoutKey(s, "groupId");
  });
  const next: Project = { ...p, sheets };
  if (groups.length) next.groups = groups;
  else delete next.groups;
  return next;
}

function withoutKey<T extends object, K extends keyof T>(o: T, k: K): T {
  const copy = { ...o };
  delete copy[k];
  return copy;
}
