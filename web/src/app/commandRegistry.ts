// The command registry: every project-level command, once, with its label,
// shortcut and group. The header's File and View menus and the command
// palette (Ctrl/Cmd+K) are built from it (DECISIONS 5), so a command has
// one name and one shortcut wherever it is offered.
//
// Commands that need the shell's own pieces (the hidden file inputs, the
// About dialog, the Preferences popover, the Help panel) are requests on a
// window event that the header answers (the pattern of share/events.ts),
// so the palette, which renders outside the header, can run them too.
import { useMemo } from "react";
import { openGridFind, openGridReplace } from "./gridFind";
import { focusNote } from "./noteFocus";
import { printSheet } from "./usePrint";
import { useCommands } from "./commands";
import { canPickFiles } from "./fileSave";
import { useProject } from "./context";
import { useUi } from "./ui";
import { familyChildren, familyRootId, findSheet } from "../project/ops";
import type { Sheet } from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";
import { openPowerTool } from "../power/events";
import { openRatesTool } from "../rates/events";
import { openFlowEvents } from "../sheets/assays/flow/eventsModel";
import {
  exportBundle, exportPzfxFile, exportStatsTable, exportWorkbook, openPptxExport, openReplay,
  openShareLink,
} from "../share/events";
import { PZFX_TYPES } from "../share/pzfx";

// ------------------------------------------------------------ shell requests

const SHELL_EVENT = "opendose-shell";
export type ShellRequest =
  | "open" | "new-project" | "about" | "preferences" | "prism-csv" | "help" | "which-test"
  // answered by the shell (App.tsx)
  | "example" | "describe" | "plan"
  // answered by components/ProjectVersions.tsx (P-72, P-73)
  | "save-version" | "recent" | "compare";

export function requestShell(kind: ShellRequest): void {
  window.dispatchEvent(new CustomEvent<ShellRequest>(SHELL_EVENT, { detail: kind }));
}

export function onShellRequest(fn: (kind: ShellRequest) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<ShellRequest>).detail);
  window.addEventListener(SHELL_EVENT, h);
  return () => window.removeEventListener(SHELL_EVENT, h);
}

// ------------------------------------------------------------ shortcuts

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
/** A shortcut as this OS writes it: "⌘S" on a Mac, "Ctrl+S" elsewhere. */
export const modKey = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

// ------------------------------------------------------------ the registry

export type CommandGroup =
  | "file" | "new" | "share" | "tools" | "theme" | "view" | "context";

export interface Command {
  id: string;
  /** Menu label; ends with "…" when it opens a dialog. */
  label: string;
  group: CommandGroup;
  /** As the OS writes it ("⌘S"). */
  shortcut?: string;
  /** More words the palette matches (not shown). */
  keywords?: string;
  disabled?: boolean;
  /** Theme items: the checked one. */
  checked?: boolean;
  /** Context commands: the sheet they act on, for the palette's hint. */
  about?: string;
  /** Shown first in the palette before anything is typed. */
  suggested?: boolean;
  /** Acts on the sheet on screen or its family (ranked first). */
  context?: boolean;
  run: () => void;
}

/** Labels of the File and View menu groups. */
export const GROUP_LABELS: Record<"new" | "share" | "tools", string> = {
  new: "New",
  share: "Share and export",
  tools: "Tools",
};

export function useCommandRegistry(): Command[] {
  const api = useProject();
  const cmd = useCommands();
  const ui = useUi();
  const { project, selectedId, select, prefs, setPrefs, readOnly } = api;

  return useMemo(() => {
    const selected = findSheet(project, selectedId);
    const list: Command[] = [
      // ---- file
      { id: "new-project", label: "New project…", group: "file",
        keywords: "start again blank clear", run: () => requestShell("new-project") },
      { id: "open", label: "Open…", group: "file", shortcut: modKey("O"),
        keywords: "project file prism pzfx import load", run: () => requestShell("open") },
      { id: "recent", label: "Open recent…", group: "file",
        keywords: "recent projects versions sessions history restore autosave",
        run: () => requestShell("recent") },
      { id: "example", label: "Open the example project…", group: "file",
        keywords: "sample demo dose response contingency survival", run: () => requestShell("example") },
      { id: "save", label: "Save project", group: "file", shortcut: modKey("S"),
        keywords: "download project file json keep", run: () => { void cmd.save(); } },
      // Only where the browser can write a picked file (P-71); elsewhere
      // Save project's download already asks where, as the browser is set.
      ...(canPickFiles() ? [{ id: "save-as", label: "Save as…", group: "file" as const,
        keywords: "save copy new file name location json", run: () => { void cmd.saveAs(); } }] : []),
      { id: "save-version", label: "Save a version…", group: "file", disabled: readOnly,
        keywords: "version snapshot checkpoint note keep history browser",
        run: () => requestShell("save-version") },
      { id: "compare", label: "Compare with…", group: "file",
        keywords: "compare diff versions changes differences what changed exclusions",
        run: () => requestShell("compare") },
      { id: "print", label: "Print…", group: "file", shortcut: modKey("P"),
        keywords: "paper pdf", disabled: !selected,
        run: () => { if (selected) printSheet(select, selected.id); } },
      // ---- new
      { id: "new-table", label: "New data table…", group: "new",
        keywords: "add create sheet xy column grouped", disabled: readOnly, run: cmd.newTable },
      { id: "describe", label: "Describe your experiment…", group: "new",
        keywords: "which table type design not sure", disabled: readOnly,
        run: () => requestShell("describe") },
      { id: "plan", label: "Plan an experiment…", group: "new",
        keywords: "design sample size before data power checks", disabled: readOnly,
        run: () => requestShell("plan") },
      { id: "new-info", label: "New info sheet", group: "new",
        keywords: "add create notes constants", disabled: readOnly, run: cmd.addInfo },
      { id: "new-layout", label: "New layout", group: "new",
        keywords: "add create page figure panels", disabled: readOnly, run: cmd.addLayout },
      { id: "new-note", label: "New floating note", group: "new",
        keywords: "add create comment sticky", disabled: !selected || readOnly,
        run: () => {
          if (!selected) return;
          const id = cmd.addNote(selected.id);
          if (id) focusNote(id);
        } },
      // ---- share and export
      { id: "share-link", label: "Copy share link…", group: "share",
        keywords: "send colleague url", run: () => openShareLink() },
      { id: "bundle", label: "Download export bundle (.zip)", group: "share",
        keywords: "zip csv svg png methods archive", run: () => exportBundle() },
      { id: "xlsx", label: "Export tables and results to Excel (.xlsx)", group: "share",
        keywords: "excel xlsx workbook spreadsheet sheets csv numbers", run: () => exportWorkbook() },
      { id: "stats-csv", label: "Export statistics table (.csv)", group: "share",
        keywords: "statistics table every analysis p values tests summary report csv",
        run: () => exportStatsTable("csv") },
      { id: "stats-xlsx", label: "Export statistics table to Excel (.xlsx)", group: "share",
        keywords: "statistics table every analysis p values tests summary report excel xlsx",
        run: () => exportStatsTable("xlsx") },
      { id: "stats-word", label: "Copy statistics table for Word", group: "share",
        keywords: "statistics table every analysis p values tests summary report word docx clipboard",
        run: () => exportStatsTable("word") },
      { id: "pzfx", label: "Export tables as .pzfx (opens in GraphPad Prism)", group: "share",
        keywords: "prism", run: () => exportPzfxFile() },
      { id: "pptx", label: "Export graphs to PowerPoint (.pptx)…", group: "share",
        keywords: "slides powerpoint pptx", run: () => openPptxExport(null, { kind: "all" }) },
      // ---- tools
      { id: "replay", label: "Apply to new data…", group: "tools",
        keywords: "replay rerun recipe", disabled: readOnly, run: () => openReplay() },
      { id: "prism-csv", label: "Convert Prism files to CSV…", group: "tools",
        keywords: "pzfx batch", run: () => requestShell("prism-csv") },
      { id: "power", label: "Power and sample size…", group: "tools",
        keywords: "n sample size calculator", run: () => openPowerTool("power") },
      { id: "random", label: "Randomisation list…", group: "tools",
        keywords: "randomization allocation blinding", run: () => openPowerTool("random") },
      { id: "rates", label: "Compare two event rates…", group: "tools",
        keywords: "poisson rate ratio counts exposure incidence events per hour", run: () => openRatesTool() },
      { id: "flow-events", label: "Flow cytometry event counts…", group: "tools",
        keywords: "flow cytometry events acquire rare population cv poisson gated percentage confidence interval wilson facs",
        run: () => openFlowEvents() },
      // ---- view
      ...(["auto", "light", "dark"] as const).map((t): Command => ({
        id: `theme-${t}`, group: "theme", checked: prefs.theme === t,
        label: t === "auto" ? "Auto" : t === "light" ? "Light" : "Dark",
        keywords: `theme colour color appearance ${t === "auto" ? "system match" : "mode"}`,
        run: () => setPrefs({ ...prefs, theme: t }),
      })),
      { id: "help", label: "Help and tour", group: "view", shortcut: modKey("/"),
        keywords: "explainers shortcuts keyboard tour", run: () => requestShell("help") },
      { id: "find", label: "Find a command or sheet…", group: "view", shortcut: modKey("K"),
        keywords: "go to sheet search palette", run: ui.openGoTo },
      { id: "preferences", label: "Preferences…", group: "view",
        keywords: "settings defaults p value autosave privacy", run: () => requestShell("preferences") },
      { id: "about", label: "About OpenDose…", group: "view",
        keywords: "privacy cite citation version validation", run: () => requestShell("about") },
    ];
    list.push(...contextCommands(project, selected, { ...cmd, select }, readOnly));
    return list;
  }, [project, selectedId, select, prefs, setPrefs, readOnly, cmd, ui]);
}

/** Commands for the sheet on screen and its family: the palette ranks
 *  them ahead of the global ones (DECISIONS 5). */
function contextCommands(project: Parameters<typeof findSheet>[0], selected: Sheet | undefined,
  cmd: ReturnType<typeof useCommands> & { select: (id: string) => void }, readOnly: boolean): Command[] {
  if (!selected) return [];
  const out: Command[] = [];
  const rootId = familyRootId(project, selected.id);
  const data = findSheet(project, rootId);
  if (data?.kind === "data") {
    const name = data.name;
    out.push({ id: "ctx-which-test", label: "Help me choose a test…", group: "context",
      about: name, suggested: true, keywords: "which test wizard analysis",
      run: () => requestShell("which-test") });
    if (!readOnly) {
      for (const a of tableDef(data.table.type).analyses) {
        out.push({ id: `ctx-analyze-${a.id}`, label: `Analyze: ${a.label}`, group: "context",
          about: name, keywords: `add analysis ${a.short}`, run: () => cmd.addAnalysis(data.id, a.id) });
      }
    }
    out.push({ id: "ctx-find", label: "Find in this table…", group: "context", about: name,
      shortcut: modKey("F"), keywords: "search value cell row title column",
      run: () => openGridFind(data.id) });
    if (!readOnly && !data.derived && !data.frozen) {
      out.push({ id: "ctx-replace", label: "Replace in this table…", group: "context", about: name,
        shortcut: isMac ? "⌘⇧H" : "Ctrl+H", keywords: "find replace substitute n.d. code value",
        run: () => openGridReplace(data.id) });
    }
    out.push({ id: "ctx-share", label: "Share this family…", group: "context", about: name,
      suggested: true, keywords: "link send", run: () => openShareLink(data.id) });
    if (PZFX_TYPES.has(data.table.type)) {
      out.push({ id: "ctx-pzfx", label: "Export this table as .pzfx", group: "context", about: name,
        keywords: "prism", run: () => exportPzfxFile(data.id) });
    }
    if (!readOnly) {
      out.push({ id: "ctx-duplicate", label: "Duplicate family…", group: "context", about: name,
        keywords: "copy", run: () => cmd.openDuplicateFamily(data.id) });
      out.push({ id: "ctx-template", label: "Save family as template…", group: "context",
        about: name, run: () => cmd.saveTemplate(data.id) });
      if (!data.derived) {
        out.push({ id: "ctx-replay", label: "Apply new data to this table…", group: "context",
          about: name, keywords: "replay", run: () => openReplay(data.id) });
      }
    }
    const graphs = familyChildren(project, data.id).filter((c) => c.kind === "graph");
    if (graphs.length) {
      out.push({ id: "ctx-pptx", label: "Export this family's graphs to PowerPoint…",
        group: "context", about: name, keywords: "slides pptx",
        run: () => openPptxExport(selected.kind === "graph" ? selected.id : data.id) });
    }
  }
  if (selected.kind === "graph" && !readOnly) {
    out.push({ id: "ctx-consistent", label: "Apply this format to graphs of this kind…",
      group: "context", about: selected.name, keywords: "consistent style restyle",
      run: () => void cmd.makeConsistent(selected.id) });
  }
  if (selected.kind === "results" && !readOnly) {
    const def = data?.kind === "data" ? analysisDef(data.table.type, selected.analysis) : undefined;
    out.push({ id: "ctx-freeze", label: selected.frozen ? "Unfreeze these results" : "Freeze these results",
      group: "context", about: selected.name, keywords: `lock snapshot ${def?.short ?? ""}`,
      run: () => cmd.toggleFreeze(selected.id) });
  }
  out.push({ id: "ctx-print", label: "Print this sheet", group: "context", about: selected.name,
    suggested: true, keywords: "paper pdf", run: () => printSheet(cmd.select, selected.id) });
  return out.map((c) => ({ ...c, context: true }));
}
