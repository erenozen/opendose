import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DRAWER_QUERY, useMedia } from "../app/breakpoints";
import { useCommands } from "../app/commands";
import {
  GROUP_LABELS, modKey, onShellRequest, useCommandRegistry, type Command, type CommandGroup,
} from "../app/commandRegistry";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import { familyChildren, familyRootId, findSheet, setTitle } from "../project/ops";
import type { ResultsSheet } from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";
import { isAssayAnalysis } from "../sheets/assays";
import { useGuideOptional } from "../guide/context";
import { usePrismBatch } from "../share/usePrismBatch";
import AboutDialog from "./AboutDialog";
import PreferencesPopover from "./PreferencesPopover";
import { IconButton } from "./ui/IconButton";
import Menu from "./ui/Menu";
import Tooltip from "./ui/Tooltip";
import { lastInputWasKeyboard } from "./ui/useDismiss";
import { Logo } from "./WelcomePanel";
import { OPEN_ACCEPT } from "../app/useFileOpen";

/**
 * The app bar (DECISIONS 5, "One bar"): navigator toggle, the logo, the
 * project title, the analysis tabs of the current family and Analyze (the
 * bar's one keycap), then the find field (the command palette), undo,
 * redo and the File and View menus. File and View are built from the
 * command registry (app/commandRegistry.ts); the header answers the
 * registry's shell requests (open, about, preferences, help…).
 */
export default function Header({ onOpenFile, onNewProject, inert }: {
  onOpenFile: (f: File) => void;
  onNewProject: () => void;
  /** Behind the open navigator drawer (a modal dialog). */
  inert?: boolean;
}) {
  const api = useProject();
  const { project, selectedId, select, history, apply } = api;
  const ui = useUi();
  const cmd = useCommands();
  const guide = useGuideOptional();
  const registry = useCommandRegistry();
  const batch = usePrismBatch();
  const narrow = useMedia(DRAWER_QUERY);

  // The bar's height, published as --header-h for the pinned navigator
  // and scroll-padding (C-24): measured, since phones wrap the tabs to a
  // second row.
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty("--header-h", `${el.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- analysis tabs for the family of the selected sheet
  const root = selectedId ? familyRootId(project, selectedId) : null;
  const rootSheet = findSheet(project, root);
  const data = rootSheet?.kind === "data" ? rootSheet : undefined;
  const tabs = data ? familyChildren(project, data.id)
    .filter((s): s is ResultsSheet => s.kind === "results") : [];
  const active = data ? api.activeResults(data.id) : null;
  const tdef = data ? tableDef(data.table.type) : undefined;
  const labelFor = (s: ResultsSheet) => {
    const baseOf = (r: ResultsSheet) => {
      const a = analysisDef(data!.table.type, r.analysis);
      return a?.tabLabel?.(r.options) ?? a?.short ?? r.analysis;
    };
    const base = baseOf(s);
    const same = tabs.filter((t) => baseOf(t) === base);
    return same.length > 1 ? `${base} ${same.indexOf(s) + 1}` : base;
  };

  // The segmented thumb is placed through CSS variables (no React state
  // per switch) and drawn with clip-path, so a switch never lays out.
  const tablistRef = useRef<HTMLElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const t = thumbRef.current;
      const list = tablistRef.current;
      const el = list?.querySelector<HTMLElement>("button.active");
      if (!t || !list) return;
      // A switch from the keyboard lands at once (keyboard actions never animate).
      t.toggleAttribute("data-instant", lastInputWasKeyboard());
      t.style.setProperty("--thumb-x", `${el?.offsetLeft ?? 0}px`);
      t.style.setProperty("--thumb-w", `${el?.offsetWidth ?? 0}px`);
      // The whole track, scrolled part included (phones scroll the tabs).
      t.style.width = `${list.scrollWidth}px`;
      t.style.opacity = el ? "1" : "0";
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active?.id, tabs.length, project]);

  const onTabKey = (e: React.KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active?.id);
    const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1]
      : tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    select(next.id);
    requestAnimationFrame(() => tablistRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus());
  };

  // Analyze lists the standard analyses, then the assay modules under
  // their own heading.
  const plain = tdef?.analyses.filter((a) => !isAssayAnalysis(a.id)) ?? [];
  const assays = tdef?.analyses.filter((a) => isAssayAnalysis(a.id)) ?? [];

  // ---- shell requests from the registry (menus, palette, shortcuts)
  const openInput = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const handlers = useRef({ onNewProject, pick: batch.pick, guide });
  useLayoutEffect(() => { handlers.current = { onNewProject, pick: batch.pick, guide }; });
  useEffect(() => onShellRequest((kind) => {
    const h = handlers.current;
    if (kind === "open") openInput.current?.click();
    else if (kind === "new-project") h.onNewProject();
    else if (kind === "about") setAboutOpen(true);
    else if (kind === "preferences") setPrefsOpen(true);
    else if (kind === "prism-csv") h.pick();
    else if (kind === "help") {
      if (h.guide?.helpOpen) h.guide.closeHelp(); else h.guide?.openHelp();
    } else if (kind === "which-test") h.guide?.openWizard();
  }), []);

  const group = (g: CommandGroup) => registry.filter((c) => c.group === g);
  const item = (c: Command) => (
    <Menu.Item key={c.id} onSelect={c.run} disabled={c.disabled} shortcut={c.shortcut}
      textValue={c.label}>
      {c.label}
    </Menu.Item>
  );
  const themes = group("theme");

  return (
    <header ref={bar} inert={inert}>
      <Tooltip content={narrow ? "Navigator" : ui.navOpen ? "Hide the navigator" : "Show the navigator"}>
        <IconButton className="nav-toggle" onClick={ui.toggleNav}
          aria-label="Show or hide the sheet navigator"
          aria-expanded={narrow ? ui.drawerOpen : ui.navOpen}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="1.75" y="2.5" width="12.5" height="11" rx="2" />
            <path d="M6 2.5v11" />
          </svg>
        </IconButton>
      </Tooltip>
      <div className="brand">
        <Logo />
        <h1>OpenDose</h1>
      </div>
      <input className="hdr-title" value={project.title} aria-label="Project title"
        readOnly={api.readOnly} spellCheck={false}
        onChange={(e) => apply((p) => setTitle(p, e.target.value), "title")} />
      {data && (
        <div className="analysis-bar">
          {tabs.length > 0 && (
            <nav className="mode-switch" role="tablist" ref={tablistRef} data-still
              aria-label={`Analyses of ${data.name}`} onKeyDown={onTabKey}>
              <span className="seg-thumb" ref={thumbRef} aria-hidden="true" />
              {tabs.map((t) => {
                const on = t.id === active?.id;
                const label = labelFor(t);
                return (
                  <button key={t.id} role="tab" data-tab={t.id}
                    aria-selected={on} tabIndex={on ? 0 : -1}
                    title={t.name}
                    className={on ? "active" : ""}
                    onClick={() => select(t.id)}>
                    <span className="tab-label tab-label-full" data-label={label}>{label}</span>
                    <span className="tab-label tab-label-short" data-label={label}>{label}</span>
                  </button>
                );
              })}
            </nav>
          )}
          <Menu>
            <Menu.Trigger variant="secondary" className="analyze-btn"
              disabled={!tdef?.analyses.length || api.readOnly}
              title={tdef?.analyses.length ? `Add an analysis of ${data.name}`
                : "Analyses for this table type arrive in the next release"}>
              Analyze
            </Menu.Trigger>
            {tdef && (
              <Menu.Content className="analyze-menu" aria-label="Add an analysis">
                {guide && (
                  <Menu.Item className="menu-item-guide" onSelect={() => guide.openWizard()}
                    description={`Which test? A few questions about ${data.name} and its rows; get the `
                      + "recommended test with its reason, set up here."}>
                    Help me choose…
                  </Menu.Item>
                )}
                {guide && (
                  <Menu.Item className="menu-item-guide" onSelect={() => guide.openPlanner()}
                    description="Before the data: the table, the analysis, n and a design check list, saved as an analysis plan.">
                    Plan an experiment…
                  </Menu.Item>
                )}
                {plain.map((a) => (
                  <Menu.Item key={a.id} description={a.description}
                    onSelect={() => cmd.addAnalysis(data.id, a.id)}>
                    {a.label}
                  </Menu.Item>
                ))}
                {assays.length > 0 && <>
                  <Menu.Separator />
                  <Menu.Group label="Assays">
                    {assays.map((a) => (
                      <Menu.Item key={a.id} description={a.description}
                        onSelect={() => cmd.addAnalysis(data.id, a.id)}>
                        {`Assay: ${a.label}`}
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                </>}
              </Menu.Content>
            )}
          </Menu>
        </div>
      )}
      <span className="project-actions">
        <button type="button" className="hdr-find" onClick={ui.openGoTo}
          aria-label="Find a command or sheet" aria-keyshortcuts="Control+K Meta+K">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.25 3.25" />
          </svg>
          <span className="hdr-find-label" aria-hidden="true">Find a command or sheet</span>
          <kbd aria-hidden="true">{modKey("K")}</kbd>
        </button>
        <Tooltip content="Undo" shortcut={modKey("Z")}>
          <IconButton aria-label="Undo" disabled={!history.past.length} onClick={api.undo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5.5 3.5 2.5 6.5l3 3" /><path d="M2.5 6.5h7a4 4 0 0 1 0 8H7" />
            </svg>
          </IconButton>
        </Tooltip>
        <Tooltip content="Redo" shortcut={modKey("Shift+Z")}>
          <IconButton aria-label="Redo" disabled={!history.future.length} onClick={api.redo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m10.5 3.5 3 3-3 3" /><path d="M13.5 6.5h-7a4 4 0 0 0 0 8H9" />
            </svg>
          </IconButton>
        </Tooltip>
        <Menu>
          <Menu.Trigger variant="ghost" className="hdr-menu">File</Menu.Trigger>
          <Menu.Content aria-label="File" align="end" className="hdr-menu-list">
            {group("file").map(item)}
            {(["new", "share", "tools"] as const).map((g) => (
              <Fragment key={g}>
                <Menu.Separator />
                <Menu.Group label={GROUP_LABELS[g]!}>{group(g).map(item)}</Menu.Group>
              </Fragment>
            ))}
          </Menu.Content>
        </Menu>
        <Menu>
          <Menu.Trigger ref={viewRef} variant="ghost" className="hdr-menu">View</Menu.Trigger>
          <Menu.Content aria-label="View" align="end" className="hdr-menu-list">
            <Menu.RadioGroup label="Theme" className="menu-group"
              value={themes.find((c) => c.checked)?.id ?? null}
              onValueChange={(id) => themes.find((c) => c.id === id)?.run()}>
              <div className="menu-group-label" aria-hidden="true">Theme</div>
              {themes.map((c) => <Menu.RadioItem key={c.id} value={c.id}>{c.label}</Menu.RadioItem>)}
            </Menu.RadioGroup>
            <Menu.Separator />
            {group("view").map(item)}
          </Menu.Content>
        </Menu>
      </span>
      {/* Open… (File, Ctrl/Cmd+O, the palette): a visually hidden input that
          scripts can set files on; the visible control is the menu item. */}
      <input ref={openInput} type="file" accept={OPEN_ACCEPT} className="sr-only" tabIndex={-1}
        aria-hidden="true" aria-label="Open an OpenDose project or a Prism file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onOpenFile(f);
        }} />
      {batch.input}
      <PreferencesPopover open={prefsOpen} onOpenChange={setPrefsOpen} anchor={viewRef} />
      {aboutOpen && <AboutDialog dataId={data?.id} onClose={() => setAboutOpen(false)} />}
    </header>
  );
}
