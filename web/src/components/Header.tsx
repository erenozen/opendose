import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCommands } from "../app/commands";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import { familyChildren, familyRootId, findSheet } from "../project/ops";
import type { ResultsSheet } from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";
import { versionLabel } from "../export/cite";
import { useGuideOptional } from "../guide/context";
import CiteBlock from "./CiteBlock";
import SaveMenu from "../share/SaveMenu";
import MenuButton from "../sheets/common/MenuButton";
import { openPowerTool } from "../power/events";
import { openValidation } from "../share/events";
import { openChecklist } from "../report/useReport";
import PreferencesPopover from "./PreferencesPopover";
import { Logo } from "./WelcomePanel";

/**
 * App header: navigator toggle, brand, the analysis tabs of the current
 * family (a segmented control), Analyze, undo/redo and project actions.
 */
export default function Header({ onOpenFile, onNewProject }: {
  onOpenFile: (f: File) => void;
  onNewProject: () => void;
}) {
  const api = useProject();
  const { project, selectedId, select, prefs, setPrefs, status, history } = api;
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
    const a = analysisDef(data!.table.type, s.analysis);
    const base = a?.short ?? s.analysis;
    const same = tabs.filter((t) => t.analysis === s.analysis);
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
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active?.id);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    select(next.id);
    requestAnimationFrame(() => tablistRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus());
  };

  // ---- Analyze menu
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const analyzeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!analyzeOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!analyzeRef.current?.contains(e.target as Node)) setAnalyzeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAnalyzeOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => analyzeRef.current
      ?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [analyzeOpen]);

  // ---- info popover (privacy + non-affiliation note): hover on pointer
  // devices, click/focus everywhere; Escape and outside-click dismiss.
  const hoverCapable = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!infoOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!infoRef.current?.contains(e.target as Node)) setInfoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

  // Floating chrome: the header hairline/shadow appear only once content
  // actually scrolls underneath it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
            <nav className="mode-switch" role="tablist" ref={tablistRef}
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
          <span className="analyze-wrap" ref={analyzeRef}>
            <button className="analyze-btn" aria-haspopup="menu" aria-expanded={analyzeOpen}
              disabled={!tdef?.analyses.length || api.readOnly}
              title={tdef?.analyses.length ? `Add an analysis of ${data.name}`
                : "Analyses for this table type arrive in the next release"}
              onClick={() => setAnalyzeOpen((o) => !o)}>
              Analyze
            </button>
            {analyzeOpen && tdef && (
              <div className="sheet-menu analyze-menu" role="menu" aria-label="Add an analysis"
                onKeyDown={(e) => {
                  const items = [...(analyzeRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
                  const i = items.indexOf(document.activeElement as HTMLElement);
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
                  }
                }}>
                {guide && (
                  <button type="button" role="menuitem" tabIndex={-1}
                    className="menu-item menu-item-2line menu-item-guide"
                    onClick={() => { setAnalyzeOpen(false); guide.openWizard(); }}>
                    <span>Which test?…</span>
                    <span className="menu-desc">Answer a few questions about your design; get a
                      recommended test with its reason, set up on this table.</span>
                  </button>
                )}
                {tdef.analyses.map((a) => (
                  <button key={a.id} type="button" role="menuitem" tabIndex={-1}
                    className="menu-item menu-item-2line"
                    onClick={() => { setAnalyzeOpen(false); cmd.addAnalysis(data.id, a.id); }}>
                    <span>{a.label}</span>
                    {a.description && <span className="menu-desc">{a.description}</span>}
                  </button>
                ))}
              </div>
            )}
          </span>
        </div>
      )}
      <span className="project-actions">
        <button className="theme-btn" aria-label="Undo" title={`Undo (${modKey}Z)`}
          disabled={!history.past.length} onClick={api.undo}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5.5 3.5 2.5 6.5l3 3" /><path d="M2.5 6.5h7a4 4 0 0 1 0 8H7" />
          </svg>
        </button>
        <button className="theme-btn" aria-label="Redo" title={`Redo (${modKey}Shift+Z)`}
          disabled={!history.future.length} onClick={api.redo}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m10.5 3.5 3 3-3 3" /><path d="M13.5 6.5h-7a4 4 0 0 0 0 8H9" />
          </svg>
        </button>
        {/* Hover open/close only on hover-capable pointers; touch taps
            synthesize mouseenter/leave pairs that would instantly undo
            the open. Touch relies on the click + outside-tap path. */}
        <span className="info-wrap" ref={infoRef}
          onMouseEnter={() => { if (hoverCapable()) setInfoOpen(true); }}
          onMouseLeave={() => { if (hoverCapable()) setInfoOpen(false); }}>
          <button className="theme-btn info-btn"
            aria-label="About OpenDose: privacy, non-affiliation and how to cite"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 7.4v3.8" strokeLinecap="round" />
              <circle cx="8" cy="4.8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {infoOpen && (
            <div className="info-pop" role="note">
              <p className="info-privacy">
                Privacy: all computation runs in your browser and no data is
                sent anywhere. Autosave stays in this browser&apos;s own
                storage. A share link puts the data in the link itself, so
                only the people you give it to can open it.
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
                <button type="button" className="linkish"
                  onClick={() => { setInfoOpen(false); openValidation(); }}>
                  How OpenDose is validated
                </button>
                {" · "}
                <button type="button" className="linkish"
                  onClick={() => { setInfoOpen(false); openChecklist(data?.id); }}>
                  Journal checklists
                </button>
              </p>
              <CiteBlock />
            </div>
          )}
        </span>
        <button className="theme-btn" onClick={cycleTheme}
          title={`Theme: ${theme === "auto" ? "match system" : theme}`}
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
        {guide && (
          <button className="theme-btn help-btn" onClick={() => (guide.helpOpen
            ? guide.closeHelp() : guide.openHelp())}
            aria-label="Help: explainers, tour and keyboard shortcuts"
            aria-expanded={guide.helpOpen} title={`Help (${modKey}/)`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M6.2 6.3a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.8" />
              <circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
        <PreferencesPopover />
        <span className="save-menu tools-menu">
          <MenuButton align="right" title="Tools" label="Tools" items={[
            { label: "Power and sample size…", onSelect: () => openPowerTool("power") },
            { label: "Randomisation list…", onSelect: () => openPowerTool("random") },
          ]} />
        </span>
        <button onClick={onNewProject} aria-label="New project" title="New project">New</button>
        <button onClick={cmd.save} aria-label="Save project">
          <span className="label-full">Save project</span>
          <span className="label-short" aria-hidden="true">Save</span>
        </button>
        <SaveMenu onSave={cmd.save} />
        <label className="load-btn">
          Open
          <input type="file" accept=".json,.pzfx,.prism,.zip" hidden
            aria-label="Open an OpenDose project or a Prism file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onOpenFile(f);
              e.target.value = "";
            }} />
        </label>
        <span className="status" role="status" aria-live="polite">
          {status}
        </span>
      </span>
    </header>
  );
}
