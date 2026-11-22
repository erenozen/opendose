import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCommands } from "../app/commands";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import { familyChildren, familyRootId, findSheet } from "../project/ops";
import type { ResultsSheet } from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";
import { isAssayAnalysis } from "../sheets/assays";
import { versionLabel } from "../export/cite";
import { useGuideOptional } from "../guide/context";
import CiteBlock from "./CiteBlock";
import SaveMenu from "../share/SaveMenu";
import MenuButton from "../sheets/common/MenuButton";
import { openPowerTool } from "../power/events";
import { openPrivacy, openValidation } from "../share/events";
import { openChecklist } from "../report/useReport";
import PreferencesPopover from "./PreferencesPopover";
import Menu from "./ui/Menu";
import Popover from "./ui/Popover";
import Tooltip from "./ui/Tooltip";
import { Logo } from "./WelcomePanel";
import { FileButton } from "./ui/Button";
import { OPEN_ACCEPT } from "../app/useFileOpen";

/**
 * App header: navigator toggle, brand, the analysis tabs of the current
 * family (a segmented control), Analyze, undo/redo and project actions.
 */
export default function Header({ onOpenFile, onNewProject }: {
  onOpenFile: (f: File) => void;
  onNewProject: () => void;
}) {
  const api = useProject();
  const { project, selectedId, select, prefs, setPrefs, history } = api;
  const ui = useUi();
  const cmd = useCommands();
  const guide = useGuideOptional();

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

  const tablistRef = useRef<HTMLElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  // Sliding segmented-control thumb: measured from the active tab so the
  // pill glides between analyses instead of jumping.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tablistRef.current?.querySelector<HTMLElement>("button.active");
      setThumb(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
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

  // Floating chrome: the header hairline/shadow appear only once content
  // actually scrolls underneath it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Phone widths: the secondary actions (about, theme, help, preferences,
  // tools, new project) fold into a "More" panel so the primary ones
  // (undo, redo, save, open) stay on one row. On wider screens the panel
  // is `display: contents` and the button is hidden (components/header.css).
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLSpanElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!moreRef.current?.contains(t) && !moreBtnRef.current?.contains(t)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".hdr-secondary .info-pop, .hdr-secondary .sheet-menu")) {
        setMoreOpen(false);
        moreBtnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const theme = prefs.theme;
  const cycleTheme = () => setPrefs({
    ...prefs, theme: theme === "auto" ? "light" : theme === "light" ? "dark" : "auto",
  });
  const mac = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
  const modKey = mac ? "⌘" : "Ctrl+";

  return (
    <header data-scrolled={scrolled ? "true" : "false"}>
      <button className="theme-btn nav-toggle" onClick={ui.toggleNav}
        aria-label="Show or hide the sheet navigator"
        aria-expanded={typeof window !== "undefined"
          && window.matchMedia("(max-width: 900px)").matches ? ui.drawerOpen : ui.navOpen}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="1.75" y="2.5" width="12.5" height="11" rx="2" />
          <path d="M6 2.5v11" />
        </svg>
      </button>
      <div className="brand">
        <Logo />
        <h1>OpenDose</h1>
      </div>
      {data && (
        <div className="analysis-bar">
          {tabs.length > 0 && (
            <nav className="mode-switch" role="tablist" ref={tablistRef} data-still
              aria-label={`Analyses of ${data.name}`} onKeyDown={onTabKey}>
              <span className="seg-thumb" aria-hidden="true" style={{
                width: thumb ? `${thumb.w}px` : 0,
                transform: thumb ? `translateX(${thumb.x}px)` : undefined,
                opacity: thumb ? 1 : 0,
              }} />
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
            <Menu.Trigger className="analyze-btn"
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
        <Tooltip content="Undo" shortcut={`${modKey}Z`}>
        <button className="theme-btn" aria-label="Undo"
          disabled={!history.past.length} onClick={api.undo}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5.5 3.5 2.5 6.5l3 3" /><path d="M2.5 6.5h7a4 4 0 0 1 0 8H7" />
          </svg>
        </button>
        </Tooltip>
        <Tooltip content="Redo" shortcut={`${modKey}Shift+Z`}>
        <button className="theme-btn" aria-label="Redo"
          disabled={!history.future.length} onClick={api.redo}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m10.5 3.5 3 3-3 3" /><path d="M13.5 6.5h-7a4 4 0 0 0 0 8H9" />
          </svg>
        </button>
        </Tooltip>
        <span className="hdr-secondary" id="header-secondary" ref={moreRef}
          data-open={moreOpen ? "true" : "false"}>
        {/* About: privacy, non-affiliation and how to cite. A click opens it
            and a second click closes it; on hover the tooltip names it. */}
        <span className="info-wrap">
          <Popover>
            <Tooltip content="About OpenDose">
              <Popover.Trigger className="theme-btn info-btn"
                aria-label="About OpenDose: privacy, non-affiliation and how to cite">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                  stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.25" />
                  <path d="M8 7.4v3.8" strokeLinecap="round" />
                  <circle cx="8" cy="4.8" r="0.9" fill="currentColor" stroke="none" />
                </svg>
              </Popover.Trigger>
            </Tooltip>
            <Popover.Content className="info-pop" aria-label="About OpenDose" align="end">
              <p className="info-privacy">
                Privacy: all computation runs in your browser and no data is
                sent anywhere; the page contacts no server but this one.
                Autosave stays in this browser&apos;s own storage (Preferences,
                Privacy on this computer: turn it off, or forget everything).
                A share link carries the data inside it, so protect it with a
                password.{" "}
                <Popover.Close data-still className="linkish" onClick={() => openPrivacy()}>
                  How your data stays private
                </Popover.Close>
              </p>
              <p className="info-format">
                File format: project files carry a version number, and every
                release opens every earlier version, so an old file never
                needs the newest build.
              </p>
              <p>
                OpenDose is a free, independent open-source project built
                on NumPy/SciPy. It is not affiliated with, endorsed by, or
                sponsored by GraphPad Software; results are cross-validated
                against independent implementations.
              </p>
              <p className="info-version">
                Version {versionLabel()} ·{" "}
                <Popover.Close data-still className="linkish" onClick={() => openValidation()}>
                  How OpenDose is validated
                </Popover.Close>
                {" · "}
                <Popover.Close data-still className="linkish" onClick={() => openChecklist(data?.id)}>
                  Journal checklists
                </Popover.Close>
              </p>
              <CiteBlock />
            </Popover.Content>
          </Popover>
        </span>
        <Tooltip content={`Theme: ${theme === "auto" ? "match system" : theme}`}>
        <button className="theme-btn" onClick={cycleTheme}
          aria-label={`Color theme: ${theme}. Click to change`}>
          {theme === "light" ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="8" r="3.25" />
              <path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.27
                1.27M11.53 11.53l1.27 1.27M12.8 3.2l-1.27 1.27M4.47
                11.53L3.2 12.8" />
            </svg>
          ) : theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 16 16"
              fill="currentColor" aria-hidden="true">
              <path d="M13.4 9.9A6 6 0 1 1 6.1 2.6a6.9 6.9 0 1 0 7.3 7.3Z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" fill="none"
                stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z" fill="currentColor" />
            </svg>
          )}
        </button>
        </Tooltip>
        {guide && (
          <Tooltip content="Help" shortcut={`${modKey}/`}>
          <button className="theme-btn help-btn" onClick={() => {
            setMoreOpen(false);
            if (guide.helpOpen) guide.closeHelp(); else guide.openHelp();
          }}
            aria-label="Help: explainers, tour and keyboard shortcuts"
            aria-expanded={guide.helpOpen}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M6.2 6.3a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.8" />
              <circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>
          </Tooltip>
        )}
        <PreferencesPopover />
        <span className="save-menu tools-menu">
          <MenuButton align="right" title="Tools" label="Tools" items={[
            { label: "Power and sample size…", onSelect: () => { setMoreOpen(false); openPowerTool("power"); } },
            { label: "Randomisation list…", onSelect: () => { setMoreOpen(false); openPowerTool("random"); } },
          ]} />
        </span>
        <button onClick={() => { setMoreOpen(false); onNewProject(); }} aria-label="New project"
          title="New project">New</button>
        </span>
        <button onClick={cmd.save} aria-label="Save project">
          <span className="label-full">Save project</span>
          <span className="label-short" aria-hidden="true">Save</span>
        </button>
        <SaveMenu onSave={cmd.save} />
        <FileButton variant="ghost" className="open-btn" accept={OPEN_ACCEPT}
          inputLabel="Open an OpenDose project or a Prism file"
          title={`Open a project or a Prism file (${modKey}O)`} onFile={onOpenFile}>
          Open</FileButton>
        <button ref={moreBtnRef} type="button" className="theme-btn hdr-more-btn"
          aria-label="More actions" aria-expanded={moreOpen} aria-controls="header-secondary"
          title="More: about, theme, help, preferences, tools, new project"
          onClick={() => setMoreOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="12.5" cy="8" r="1.4" />
          </svg>
        </button>
      </span>
    </header>
  );
}
