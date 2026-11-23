// Stage harness for screenshot review of the OpenDose interface.
//
//   The gap:     half the interface can only be judged in states that take
//                minutes to reach by hand (engine booting or failed, a
//                failed fit, a deep wizard step, 40 columns, 80-character
//                names), so reviews look at the easy states and miss these.
//   The tool:    a stage: every surface and hard state is a named scene
//                that a fresh browser reaches the same way every time,
//                from fixture projects with worst-case content
//                (e2e-fixtures/stage/, written by build.mjs there).
//   The controls: which scenes (names or prefixes: shell-*, grid-*,
//                results-*, graphs-*, first-*, guided-*), motion on or
//                reduced, how many scenes run at once.
//   The export:  OUT/<scene>-<1400|390>-<light|dark>.png, OUT/axe.json
//                (WCAG 2 A/AA per shot), OUT/errors.json (console and page
//                errors, failed scenes, theme mismatches, sideways
//                scroll), OUT/index.html (contact sheet: a row per scene).
//
// Usage: node scripts/ui-stage.mjs <baseUrl> <OUT> [scene,prefix-*] [--motion] [--jobs=N]
//   e.g. node scripts/ui-stage.mjs http://localhost:5201/ ../.design/baseline
//        node scripts/ui-stage.mjs http://localhost:5201/ /tmp/shots "grid-*,first-landing"
// Reduced motion is emulated unless --motion is given. Each scene runs in a
// fresh browser context per width (state is built at that width), then is
// shot in light and dark through the emulated colour scheme; the app's own
// theme preference stays "auto", and every shot checks that the page
// background really follows the scheme. The 390 px context is a touch
// phone (isMobile, hasTouch: no hover, coarse pointer). A scene that throws leaves
// OUT/<scene>-FAILED.png and the run goes on. List the scenes with --list.
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "e2e-fixtures");
const STAGE = join(FIXTURES, "stage");
const AXE_SRC = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const LIST = flags.includes("--list");
const MOTION = flags.includes("--motion");
const JOBS = Number(flags.find((f) => f.startsWith("--jobs="))?.slice(7) ?? 2) || 2;
const baseUrl = args[0] ?? "http://localhost:5201/";
const OUT = args[1];
const ONLY = args[2] ? args[2].split(",").map((s) => s.trim()).filter(Boolean) : null;
if (!OUT && !LIST) {
  console.error("Usage: node scripts/ui-stage.mjs <baseUrl> <OUT> [scene,prefix-*] [--motion] [--jobs=N]");
  process.exit(2);
}

const WIDE = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };
const THEMES = ["light", "dark"];
const url = (params = {}) => {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

// ------------------------------------------------------------ helpers
// `s` is the scene's stage: { page, context, vp, phone }.

const RUNTIME = /\/pyodide\/|cdn\.jsdelivr\.net/;

/** Engine downloads stall on the largest wheel: the boot progress stays
 *  mid-way for as long as the scene needs it. */
async function holdEngine(s) {
  await s.context.route(RUNTIME, (route) => {
    if (/scipy-[^/]*\.whl/.test(route.request().url())) return; // never answered
    return route.continue();
  });
}
/** Every runtime download fails: the engine error with Try again. */
async function failEngine(s) {
  await s.context.route(RUNTIME, (route) => route.abort("connectionrefused"));
}

async function open(s, params = {}) {
  await s.page.goto(url(params), { waitUntil: "domcontentloaded" });
  await s.page.locator("header").waitFor({ timeout: 60000 });
}
/** A first visit (no autosave): the workspace on the example, with its
 *  shipped results (DECISIONS 4). */
async function start(s) {
  await open(s);
  await s.page.locator(".shell").waitFor({ timeout: 60000 });
}
/** Ctrl/Cmd+V outside a field: the clipboard text replaces the example. */
const PASTED = "Dose (µM)\tRep 1\tRep 2\tRep 3\n0.01\t98.2\t97.1\t99.0\n0.1\t96.0\t88.4\t#DIV/0!\n"
  + "1\t71.3\t66.0\t69.5\n10\t30.2\t35.1\t28.4\n100\t5.6\t8.1\t6.3\n";
async function pasteOnPage(s, text = PASTED) {
  await s.page.evaluate((t) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
  await s.page.locator(".paste-banner").waitFor({ timeout: 10000 });
}
/** The bundled example project with its live results. */
async function example(s, { live = true } = {}) {
  await open(s, { example: "1" });
  await s.page.locator(".shell").waitFor({ timeout: 60000 });
  if (live) await waitLive(s);
}
/** Opens a project file (or a Prism file) through the header's Open input. */
async function fixture(s, file, { live = false } = {}) {
  await start(s);
  await s.page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    file.includes("/") ? file : join(STAGE, file));
  await s.page.locator(".shell").waitFor({ timeout: 60000 });
  await waitEngine(s);
  if (live) await waitLive(s);
}
/** The engine is up: every engine boot slot on the page says ready (the
 *  slot stays mounted after the boot, DECISIONS 4). */
const waitEngine = (s) => s.page.waitForFunction(
  () => !document.querySelector('[data-engine-phase]:not([data-engine-phase="ready"])')
    && globalThis.__opendoseEngine?.state.phase === "ready",
  null, { timeout: 240000, polling: 500 });
const waitLive = (s, timeout = 240000) =>
  s.page.locator('.pane-results[data-live="true"]').first().waitFor({ timeout });
const settle = async (s, ms = 700) => {
  await s.page.evaluate(() => document.fonts?.ready).catch(() => {});
  await s.page.waitForTimeout(ms);
};

/** Makes `loc` visible: at phone width the navigator sits in a drawer. */
async function reveal(s, loc) {
  const first = loc.first();
  if (await first.isVisible().catch(() => false)) return first;
  const nav = s.page.getByRole("button", { name: "Show or hide the sheet navigator" });
  if (await nav.isVisible().catch(() => false)) {
    await nav.click();
    await s.page.waitForTimeout(500);
  }
  await first.waitFor({ state: "visible", timeout: 8000 });
  return first;
}
const click = async (s, loc) => (await reveal(s, loc)).click();
const button = (s, name, exact = true) => s.page.getByRole("button", { name, exact });
/** Selects a sheet in the navigator (opening the drawer at phone width). */
const selectSheet = (s, name) =>
  click(s, s.page.getByRole("treeitem", { name, exact: typeof name === "string" }));
async function analyzeItem(s, item) {
  await click(s, button(s, "Analyze"));
  await s.page.getByRole("menuitem", { name: item }).click();
}
/** The header's File or View menu (DECISIONS 5), and one of its items. */
async function headerMenu(s, menu, item) {
  await click(s, s.page.locator("header").getByRole("button", { name: menu, exact: true }));
  await s.page.getByRole("menu", { name: menu }).waitFor();
  if (item) await s.page.getByRole("menuitem", { name: item }).click();
}
const dialog = (s, name) => s.page.getByRole("dialog", { name });
/** Brings an element into view inside whatever scrolls it. */
const into = (s, selector, block = "start") => s.page.evaluate(([sel, b]) => {
  document.querySelector(sel)?.scrollIntoView({ block: b, inline: "nearest" });
  // keep the top of the element clear of the sticky header
  if (b === "start") window.scrollBy(0, -((document.querySelector("header")?.offsetHeight ?? 0) + 8));
}, [selector, block]);
async function pasteInto(s, cellLabel, text, html = null) {
  await s.page.evaluate(([l, t, h]) => {
    const el = document.querySelector(`.data-table input[aria-label='${l}']`);
    if (!el) throw new Error(`no cell ${l}`);
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    if (h) dt.setData("text/html", h);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [cellLabel, text, html]);
}
/** Writes autosave sessions (project/sessions.ts records) into this
 *  origin's IndexedDB, each holding a small real project. */
async function seedSessions(s, sessions) {
  const json = readFileSync(join(STAGE, "empty-states.json"), "utf8");
  await s.page.evaluate(async ([list, j]) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("opendose", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("autosave"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction("autosave", "readwrite");
      for (const x of list) tx.objectStore("autosave").put({ ...x, json: j }, `session:${x.id}`);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, [sessions, json]);
}
/** A new table of `type` from pasted text (first line: column titles),
 *  through the Import dialog, as the e2e suites make one. `subcolumns`:
 *  replicate subcolumns per data set (XY starts with three). */
async function pastedTable(s, type, name, text, subcolumns) {
  await example(s);
  const nd = await newTableDialog(s);
  await nd.locator(`input[name="table-type"][value="${type}"]`).check();
  await nd.getByLabel("Table name").fill(name);
  if (subcolumns) await nd.locator(".field-num input").nth(1).fill(String(subcolumns));
  await nd.getByRole("button", { name: "Create table" }).click();
  await s.page.locator(".grid-toolbar").waitFor();
  await click(s, s.page.getByRole("button", { name: "Import…", exact: true }));
  const imp = s.page.locator(".import-dialog");
  await imp.getByLabel("Pasted text").check();
  await imp.getByLabel("Text to import").fill(text);
  const titles = imp.getByLabel(/holds column titles/);
  if (!(await titles.isChecked())) await titles.check();
  await imp.getByRole("tab", { name: "Placement" }).click();
  await imp.getByLabel(/In place of the table/).check();
  await imp.getByRole("button", { name: "Import", exact: true }).click();
  await imp.waitFor({ state: "detached", timeout: 30000 });
}
async function newTableDialog(s) {
  await headerMenu(s, "File", "New data table…");
  const dlg = s.page.locator("dialog.new-table-dialog");
  await dlg.waitFor({ timeout: 10000 });
  return dlg;
}

// ------------------------------------------------------------ scenes
// Each scene: setup(s) builds the state; `full` shoots the full page
// instead of the viewport. Names start with the surface they belong to.

const scenes = [
  // ---- first run
  // The landing of a first visit: the example with its shipped results,
  // the "Example data" banner and the paste line (DECISIONS 4).
  { name: "first-landing", full: true, setup: async (s) => {
    await start(s);
    await s.page.locator(".example-banner").waitFor({ timeout: 30000 });
  } },
  { name: "first-paste-confirm", setup: async (s) => {
    await start(s);
    await pasteOnPage(s);
    await into(s, ".paste-banner", "center");
  } },
  // a pasted block with a Sex column: the banner asks about it (P-62)
  { name: "first-paste-sex", setup: async (s) => {
    await start(s);
    await pasteOnPage(s, "Sex\tWeight (g)\tDose (mg/kg)\nF\t20.1\t0\nM\t26.4\t0\nF\t21.9\t10\nM\t27.0\t10\n"
      + "F\t19.7\t30\nM\t25.8\t30\n");
    await s.page.locator(".paste-sex-note").waitFor({ timeout: 10000 });
    await into(s, ".paste-banner", "center");
  } },
  // P-05: a column Excel showed rounded, pasted anywhere with its HTML
  // (e2e-fixtures/clipboard): the full values, and the banner says so
  { name: "first-paste-full-values", setup: async (s) => {
    await start(s);
    const clip = (f) => readFileSync(join(FIXTURES, "clipboard", f), "utf8");
    await s.page.evaluate(([t, h]) => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const dt = new DataTransfer();
      dt.setData("text/plain", t);
      dt.setData("text/html", h);
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [clip("column.excel-windows.txt"), clip("column.excel-windows.html")]);
    await s.page.locator(".paste-banner [data-part='rounded']").waitFor({ timeout: 10000 });
    await into(s, ".paste-banner", "center");
  } },
  { name: "first-paste-result", setup: async (s) => {
    await start(s);
    await pasteOnPage(s);
    await waitLive(s);
  } },
  { name: "first-engine-booting", setup: async (s) => {
    await holdEngine(s);
    await start(s);
    await pasteOnPage(s);
    await s.page.waitForFunction(() => /[1-9]/.test(
      document.querySelector(".engine-boot-note .engine-slot-bytes")?.textContent?.split(" of ")[0] ?? ""),
    null, { timeout: 60000 });
  } },
  { name: "first-engine-booting-example", setup: async (s) => {
    await holdEngine(s);
    await example(s, { live: false });
    await s.page.locator(".engine-boot-note").waitFor({ timeout: 60000 });
  } },
  { name: "first-engine-failed", setup: async (s) => {
    await failEngine(s);
    await start(s);
    await pasteOnPage(s);
    await s.page.locator(".engine-boot-note").getByRole("button", { name: "Try again" })
      .waitFor({ timeout: 120000 });
  } },
  { name: "first-engine-failed-example", setup: async (s) => {
    await failEngine(s);
    await start(s);
    await s.page.locator(".engine-boot-note").getByRole("button", { name: "Try again" })
      .waitFor({ timeout: 120000 });
  } },
  { name: "first-example", setup: example },

  // ---- shell: header, navigator, dialogs, status
  { name: "shell-analyze-menu", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Analyze"));
    await s.page.getByRole("menu", { name: "Add an analysis" }).waitFor();
  } },
  { name: "shell-new-table", setup: async (s) => { await example(s); await newTableDialog(s); } },
  { name: "shell-new-table-assay", setup: async (s) => {
    await example(s);
    const dlg = await newTableDialog(s);
    await dlg.getByRole("radio", { name: "Start from an assay" }).check();
  } },
  { name: "shell-preferences", setup: async (s) => {
    await example(s);
    await headerMenu(s, "View", "Preferences…");
    await dialog(s, "Preferences").waitFor();
  } },
  { name: "shell-preferences-pins", setup: async (s) => {
    await fixture(s, "pins.json");
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await headerMenu(s, "View", "Preferences…");
    const pins = dialog(s, "Preferences").getByRole("region", { name: "Colours pinned to groups" });
    await pins.locator(".pins-warnings p").first().waitFor();
    await pins.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 400);
  } },
  { name: "shell-about", setup: async (s) => {
    await example(s);
    await headerMenu(s, "View", "About OpenDose…");
    await dialog(s, "About OpenDose").waitFor();
  } },
  { name: "shell-help", setup: async (s) => {
    await example(s);
    await headerMenu(s, "View", "Help and tour");
    await button(s, "Take the tour").waitFor();
  } },
  { name: "shell-view-menu", setup: async (s) => {
    await example(s);
    await headerMenu(s, "View");
  } },
  { name: "shell-file-menu", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File");
    await s.page.getByRole("menuitem", { name: "Copy share link…" }).waitFor();
  } },
  { name: "shell-share", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "Copy share link…");
    await s.page.locator("dialog[open]").first().waitFor();
    await settle(s, 1200);
  } },
  { name: "shell-export-pptx", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "Export graphs to PowerPoint (.pptx)…");
    await dialog(s, "Export graphs to PowerPoint").waitFor();
  } },
  { name: "shell-export-table", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Export…"));
    await s.page.locator("dialog[open]").first().waitFor();
  } },
  { name: "shell-import", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Import…"));
    await dialog(s, "Import data").waitFor();
  } },
  // the workbook report (P-06): rows hidden by a filter, formulas saved
  // without values (e2e-fixtures/xlsx/)
  ...[["shell-import-filtered", "filter-hidden.xlsx", /hidden by a filter/],
    ["shell-import-formulas", "formulas-uncached.xlsx", /no saved value/]].map(([name, file, re]) => ({
    name, setup: async (s) => {
      await example(s);
      await click(s, button(s, "Import…"));
      const d = dialog(s, "Import data");
      await d.waitFor();
      await d.locator('input[aria-label="File to import"]').setInputFiles(join(here, "..", "e2e-fixtures", "xlsx", file));
      await d.locator(".workbook-report").filter({ hasText: re }).waitFor({ timeout: 120000 });
    },
  })),
  // one table file dropped on the page (P-33): the Import dialog for a new
  // table, its guessed type and why; plate-reader.csv adds the recipe hint
  ...[["shell-import-drop", ["import", "dose-response.csv"], null],
    ["shell-import-drop-recipe", ["plate-reader.csv"], "[data-part='recipe-hint']"]].map(([name, file, wait]) => ({
    name, setup: async (s) => {
      await example(s);
      const b64 = readFileSync(join(here, "..", "e2e-fixtures", ...file)).toString("base64");
      await s.page.evaluate(([n, data]) => {
        const dt = new DataTransfer();
        dt.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], n));
        document.body.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, [file.at(-1), b64]);
      const d = dialog(s, "Import data");
      await d.locator(".import-preview tbody tr").first().waitFor({ timeout: 30000 });
      if (wait) await d.locator(wait).waitFor({ timeout: 10000 });
    },
  })),
  { name: "shell-goto", setup: async (s) => {
    await fixture(s, "many-sheets.json");
    await s.page.locator(".nav-tree").first().waitFor({ state: "attached" });
    await s.page.keyboard.press("Control+k");
    const dlg = dialog(s, "Find a command or sheet");
    await dlg.waitFor();
    await s.page.keyboard.type("graph");
  } },
  { name: "shell-sheet-menu", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Actions for Dose response"));
    await s.page.getByRole("menuitem", { name: "Move to group…" }).waitFor();
  } },
  { name: "shell-move-to-group", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Actions for Dose response"));
    await s.page.getByRole("menuitem", { name: "Move to group…" }).click();
    await s.page.locator("dialog[open]").first().waitFor();
  } },
  { name: "shell-new-project-confirm", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "New project…");
    await s.page.getByRole("alertdialog", { name: "Start a new project?" }).waitFor();
  } },
  { name: "shell-nav-drawer", setup: async (s) => {
    await fixture(s, "many-sheets.json");
    if (s.phone) await click(s, button(s, "Show or hide the sheet navigator"));
    await s.page.locator(".navigator").waitFor();
  } },
  // the command palette before anything is typed: Suggested, Recent sheets
  { name: "shell-palette", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Find a command or sheet"));
    await dialog(s, "Find a command or sheet").waitFor();
  } },
  { name: "shell-navigator-many", setup: async (s) => {
    await fixture(s, "many-sheets.json");
    if (s.phone) await click(s, button(s, "Show or hide the sheet navigator"));
    await s.page.evaluate(() => { const t = document.querySelector(".nav-tree"); if (t) t.scrollTop = t.scrollHeight / 2; });
  } },
  { name: "shell-long-names", setup: (s) => fixture(s, "long-names.json", { live: true }) },
  { name: "shell-empty-project", setup: (s) => fixture(s, "empty-project.json") },
  // a Prism file with two tables: the chooser banner, then the status line
  { name: "shell-pzfx-chooser", setup: async (s) => {
    await fixture(s, join(FIXTURES, "sample.pzfx"));
    await s.page.locator(".pzfx-chooser").waitFor({ timeout: 240000 });
  } },
  // Autosave sessions (FEATURE-PLAN P-01): two kept sessions of closed
  // tabs offered at once (one with a worst-case title), and a duplicated
  // tab whose session is open in another tab.
  { name: "shell-restore-sessions", setup: async (s) => {
    await example(s, { live: false });
    await seedSessions(s, [
      { id: "stage-a", title: "Dose-response of compound XR-2231 in HepG2, MCF-7 and A549 cells, 72 h, replicate set 3",
        sheets: 12, sheet: "HepG2 viability (normalised to vehicle)", savedAt: Date.UTC(2026, 10, 23, 9, 41, 7) },
      { id: "stage-b", title: "Untitled project", sheets: 3, sheet: "Data 1", savedAt: Date.UTC(2026, 10, 22, 16, 5, 52) },
    ]);
    await example(s, { live: false });
    await s.page.locator(".restore-banner").waitFor({ timeout: 30000 });
  } },
  { name: "shell-session-held", setup: async (s) => {
    await example(s, { live: false });
    await seedSessions(s, [{ id: "stage-held", title: "Assay 3", sheets: 4, sheet: "Data 1", savedAt: Date.now() }]);
    // Another tab holds the session's lock; this tab carries its id, as a
    // duplicated tab does.
    const other = await s.context.newPage();
    await other.goto(url({ example: "1" }), { waitUntil: "domcontentloaded" });
    await other.evaluate(() => new Promise((held) => {
      navigator.locks.request("opendose-session:stage-held", () => { held(); return new Promise(() => {}); });
    }));
    await s.page.evaluate(() => sessionStorage.setItem("opendose-session", "stage-held"));
    await s.page.goto(url(), { waitUntil: "domcontentloaded" });
    await s.page.locator(".restore-banner", { hasText: "is open in another tab." }).waitFor({ timeout: 30000 });
  } },
  { name: "shell-preferences-storage", setup: async (s) => {
    await example(s, { live: false });
    await headerMenu(s, "View", "Preferences…");
    const prefs = dialog(s, "Preferences");
    await prefs.waitFor();
    await s.page.waitForFunction(() => !/^Checking/.test(document.querySelector(".storage-note")?.textContent ?? "Checking"),
      null, { timeout: 10000 });
    // The popover scrolls: bring the privacy section (the storage line) up.
    await s.page.evaluate(() => {
      const note = document.querySelector(".storage-note");
      let box = note?.parentElement;
      while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
      if (note && box) {
        box.scrollTop += note.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3;
      }
    });
    await settle(s, 300);
  } },
  { name: "shell-status-import", setup: async (s) => {
    await fixture(s, join(FIXTURES, "sample.pzfx"));
    await s.page.locator(".pzfx-chooser").getByRole("button", { name: "Import all" }).click({ timeout: 240000 });
    await s.page.waitForFunction(() => /Imported/.test(document.querySelector(".toast-region")?.textContent ?? ""),
      null, { timeout: 60000 });
  } },
  { name: "shell-status-error", setup: async (s) => {
    const bad = join(mkdtempSync(join(tmpdir(), "opendose-stage-")), "not-a-project.json");
    writeFileSync(bad, "{ \"this is\": \"not an OpenDose project\" }");
    await example(s); // engine up first: its boot messages share the status line
    await s.page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', bad);
    await s.page.waitForFunction(() => /Could not open/.test(document.querySelector(".toast-region")?.textContent ?? ""),
      null, { timeout: 30000 });
  } },

  // ---- grid
  { name: "grid-long-names", setup: async (s) => {
    await fixture(s, "long-names.json", { live: true });
    await selectSheet(s, /^Dose response of receptor occupancy/);
    await waitLive(s);
  } },
  { name: "grid-wide", setup: async (s) => {
    await fixture(s, "big-table.json", { live: true });
    await s.page.locator(".data-table").first().waitFor();
  } },
  { name: "grid-wide-scrolled", setup: async (s) => {
    await fixture(s, "big-table.json", { live: true });
    await s.page.locator(".data-table").first().waitFor();
    await into(s, ".data-table");
    await s.page.evaluate(() => {
      const w = document.querySelector(".data-table");
      w.scrollTop = Math.round(w.scrollHeight / 2);
      w.scrollLeft = Math.round((w.scrollWidth - w.clientWidth) / 2);
    });
  } },
  { name: "grid-empty-table", setup: (s) => fixture(s, "empty-states.json") },
  { name: "grid-no-analysis", setup: async (s) => {
    await fixture(s, "empty-states.json");
    await selectSheet(s, "Table with no analysis");
  } },
  { name: "grid-paste-report", setup: async (s) => {
    await fixture(s, "empty-states.json");
    await selectSheet(s, "Table with no analysis");
    await pasteInto(s, "Control, row 1", "10.2\t12.9\n\t13.1\nn/a\t#DIV/0!\n11.5\tlow\n9.8*\t14.0\n");
    const imp = s.page.locator("dialog.import-dialog");
    if (await imp.isVisible().catch(() => false)) {
      await imp.getByRole("button", { name: "Import", exact: true }).click();
    }
    await s.page.locator(".paste-report, [class*=paste-report]").first().waitFor({ timeout: 15000 });
    await into(s, ".paste-report");
  } },
  // a copy from Excel whose cells were shown rounded (P-05): the full values
  // and the sentence that says so
  { name: "grid-paste-rounded", setup: async (s) => {
    await fixture(s, "empty-states.json");
    await selectSheet(s, "Table with no analysis");
    const clip = (f) => readFileSync(join(here, "..", "e2e-fixtures", "clipboard", f), "utf8");
    await pasteInto(s, "Control, row 1", clip("mixed.excel-windows.txt"), clip("mixed.excel-windows.html"));
    await s.page.locator(".paste-report [data-part='rounded']").waitFor({ timeout: 15000 });
    await into(s, ".paste-report");
  } },
  // percents and units in a paste (P-35): the report's two readings and
  // the strip, offered and not applied
  { name: "grid-paste-percent", setup: async (s) => {
    await fixture(s, "empty-states.json");
    await selectSheet(s, "Table with no analysis");
    await pasteInto(s, "Control, row 1", "12.5%\t3.2 µM\n30%\t5 µM\n47.5%\t0.75 µM\n");
    await s.page.locator(".paste-report [data-part='percents']").waitFor({ timeout: 15000 });
    await into(s, ".paste-report");
  } },
  // a paste too long for the Import dialog's text box (P-10): a line
  // count in its place, the preview below
  { name: "grid-paste-large", setup: async (s) => {
    await fixture(s, "empty-states.json");
    await selectSheet(s, "Table with no analysis");
    const rows = Array.from({ length: 20000 }, (_, i) =>
      `${(10 + (i % 97) / 7).toFixed(3)}\t${(12 + (i % 89) / 9).toFixed(3)}`);
    await pasteInto(s, "Control, row 1", rows.join("\n"));
    await s.page.locator("dialog.import-dialog [data-part='large-paste']").waitFor({ timeout: 30000 });
  } },
  // Ctrl+F in the grid: the find bar, "1 of n", the match outlined
  { name: "grid-find", setup: async (s) => {
    await fixture(s, "row-ids.json");
    await click(s, s.page.locator(".data-table input[aria-label='Vehicle, row 1']"));
    await s.page.keyboard.press("Control+f");
    await s.page.getByRole("searchbox", { name: "Find" }).fill("M1");
    await s.page.keyboard.press("Enter");
    await into(s, ".grid-editor");
  } },
  // Ctrl+H in the grid (P-36): the replace row under find, after a Replace all
  { name: "grid-replace", setup: async (s) => {
    await fixture(s, "row-ids.json");
    await click(s, s.page.locator(".data-table input[aria-label='Vehicle, row 1']"));
    await s.page.keyboard.press("Control+h");
    await s.page.getByRole("searchbox", { name: "Find" }).fill("M1");
    await s.page.getByRole("textbox", { name: "Replace with" }).fill("Mouse 1");
    await s.page.getByRole("checkbox", { name: "Whole cell only" }).check();
    await s.page.getByRole("button", { name: "Replace all" }).click();
    await s.page.locator(".grid-replace-status").filter({ hasText: /Replaced/ }).waitFor();
    await into(s, ".grid-editor");
  } },
  { name: "grid-exclude-by-id", setup: async (s) => {
    await fixture(s, "row-ids.json");
    await click(s, s.page.locator(".grid-toolbar").getByRole("button", { name: "Rows" }));
    await s.page.getByRole("menuitem", { name: /^Exclude by ID/ }).click();
    const d = dialog(s, "Exclude rows by ID");
    await d.getByRole("textbox", { name: "IDs" }).fill("M2\nM5\nM99");
    await d.getByRole("textbox", { name: /^Reason/ }).fill("Died before day 7");
  } },
  // P-37: a block selected with Shift+Down and the More menu's Fill down (Ctrl+D)
  { name: "grid-fill-down", setup: async (s) => {
    await fixture(s, "row-ids.json");
    await click(s, s.page.locator(".data-table input[aria-label='Vehicle, row 2']"));
    await s.page.keyboard.press("ArrowUp");
    for (let i = 0; i < 3; i++) await s.page.keyboard.press("Shift+ArrowDown");
    await click(s, s.page.locator(".grid-toolbar").getByRole("button", { name: "More", exact: true }));
    await s.page.getByRole("menuitem", { name: /^Fill down/ }).waitFor();
  } },
  // P-38: "From long table…" on a paired t test, a shuffled long table of
  // mice before and after with one unmatched mouse: the pairing report
  { name: "grid-long-table-paired", setup: async (s) => {
    await example(s);
    const nd = await newTableDialog(s);
    await nd.locator('input[name="table-type"][value="column"]').check();
    await nd.getByLabel("Table name").fill("Paired mice");
    await nd.getByRole("button", { name: "Create table" }).click();
    await s.page.locator(".grid-toolbar").waitFor();
    const controls = s.page.locator(".pane-controls").first();
    await (await reveal(s, controls.locator("select.analysis-select"))).selectOption("ttest");
    await controls.getByLabel("Test", { exact: true }).selectOption("paired");
    await click(s, s.page.getByRole("button", { name: "From long table…" }));
    const d = dialog(s, "Paired values from a long table");
    await d.getByLabel("Long table text").fill(`${readFileSync(join(FIXTURES, "import", "paired_long.csv"), "utf8")}M7,before,10.0\n`);
    await d.locator(".import-summary").waitFor();
  } },
  // P-06 wherever a workbook is read: the recipe dialog and Apply to new
  // data with the AutoFilter workbook (e2e-fixtures/xlsx/filter-hidden.xlsx;
  // Apply to new data reads both of its sheets, one report line each)
  { name: "shell-import-recipe-workbook", setup: async (s) => {
    await example(s);
    await click(s, s.page.getByRole("button", { name: "Import…", exact: true }));
    await s.page.getByRole("tab", { name: "Recipes" }).click();
    const d = dialog(s, "Import with a recipe");
    await d.getByLabel("Export file to import").setInputFiles(join(FIXTURES, "xlsx", "filter-hidden.xlsx"));
    await d.locator(".workbook-report").filter({ hasText: /hidden by a filter/ }).waitFor({ timeout: 120000 });
  } },
  { name: "shell-replay-workbook", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "Apply to new data…");
    const d = dialog(s, "Apply to new data");
    await d.waitFor();
    await d.getByLabel("New data file").setInputFiles(join(FIXTURES, "xlsx", "filter-hidden.xlsx"));
    await d.locator(".workbook-report").filter({ hasText: /hidden in the workbook/ }).waitFor({ timeout: 120000 });
    await d.locator(".workbook-report").scrollIntoViewIfNeeded();
  } },
  // P-38: the import recipes' column output paired by subject ID
  { name: "shell-import-recipe-pairing", setup: async (s) => {
    await example(s);
    await click(s, s.page.getByRole("button", { name: "Import…", exact: true }));
    await s.page.getByRole("tab", { name: "Recipes" }).click();
    const d = dialog(s, "Import with a recipe");
    await d.getByLabel("Export file to import").setInputFiles(join(FIXTURES, "import", "paired_long.csv"));
    await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
    await d.getByRole("tab", { name: "Columns" }).click();
    await d.getByLabel("Column mouse holds").selectOption("subject");
    await d.getByLabel("Column time holds").selectOption("group");
    await d.getByLabel("Column value holds").selectOption("value");
    await d.getByRole("tab", { name: "Table" }).click();
    await d.getByRole("radio", { name: /^Column/ }).check();
    await d.locator(".recipe-pairing").waitFor();
    await d.locator(".recipe-pairing").scrollIntoViewIfNeeded();
  } },
  // P-59: a Prism file's Info sheet ("Cell line = HeLa", notes) opened
  { name: "shell-info-from-prism", setup: async (s) => {
    await fixture(s, join(FIXTURES, "info.pzfx"));
    await selectSheet(s, "Project info 1");
    await s.page.getByLabel("Cell line value", { exact: true }).waitFor();
  } },

  // ---- results (the headline pane first: DECISIONS 3)
  { name: "results-example", setup: async (s) => {
    await example(s);
    await into(s, ".pane-answer");
  } },
  { name: "results-failed-fit", setup: async (s) => {
    await fixture(s, "failures.json", { live: true });
    await s.page.locator(".pane-results").getByText(/Ambiguous|could not|not converge/i).first().waitFor({ timeout: 60000 });
    await into(s, ".pane-answer");
  } },
  { name: "results-error", setup: async (s) => {
    await fixture(s, "failures.json");
    await selectSheet(s, "Too few points: two doses");
    await s.page.getByText("A fit could not be computed").first().waitFor({ timeout: 240000 });
    await into(s, ".pane-answer");
  } },
  { name: "results-withheld", setup: async (s) => {
    await fixture(s, "failures.json");
    await selectSheet(s, "One value per group");
    await waitLive(s);
    await into(s, ".pane-answer");
  } },
  { name: "results-no-data", setup: async (s) => {
    await fixture(s, "empty-states.json");
    await selectSheet(s, "Results with no data");
    await settle(s, 4000);
    await into(s, ".right");
  } },
  { name: "results-long-scrolled", setup: async (s) => {
    await fixture(s, "big-table.json", { live: true });
    await settle(s, 1500);
    await s.page.evaluate(() => {
      const rows = document.querySelectorAll(".pane-results tr");
      rows[Math.floor(rows.length / 2)]?.scrollIntoView({ block: "center" });
    });
  } },
  // a replicate map on an XY table (P-08): "Across experiments" above the
  // fit of all the values; compound B's third experiment is flat and left out
  { name: "results-potency", setup: async (s) => {
    await fixture(s, "potency.json", { live: true });
    await s.page.locator(".answer-group").first().waitFor({ timeout: 120000 });
    await into(s, ".pane-answer");
  } },
  { name: "results-potency-table", setup: async (s) => {
    await fixture(s, "potency.json", { live: true });
    await s.page.locator(".experiments-card").first().waitFor({ timeout: 120000 });
    await into(s, ".experiments-card");
  } },
  // the Checks row chip on a pooled fit (the example's triplicates)
  { name: "results-pooled-chip", setup: async (s) => {
    await example(s);
    const d = s.page.locator(".pane-answer details.checks").first();
    if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
    await s.page.locator(".guide-chip", { hasText: "CI counts wells, not experiments" }).click();
    await into(s, ".guide-chip-detail", "center");
  } },
  // results honesty (wave 1): a fit's residual plots in the Checks row
  // (P-11), a rank test that cannot reach P < 0.05 (P-15), the Analysed
  // line of a regression (P-16), the ratio to control (P-18)
  { name: "results-residuals-fit", setup: async (s) => {
    await example(s);
    const d = s.page.locator(".pane-answer details.checks").first();
    if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
    await click(s, s.page.locator(".pane-answer").getByRole("button", { name: "Residuals of “Drug A”" }));
    await s.page.locator('.pane-answer .resid-plot[data-plot="qq"] .scatterlayer .point').first().waitFor();
    await settle(s, 1200);
    await into(s, ".pane-answer .residuals-card");
  } },
  { name: "results-rank-floor", setup: async (s) => {
    await pastedTable(s, "column", "Three and three", "A\tB\n1\t4\n2\t5\n3\t6\n");
    await s.page.locator(".pane-controls select.analysis-select").selectOption("ttest");
    await s.page.locator(".pane-controls").getByRole("combobox", { name: "Test", exact: true })
      .selectOption("mann_whitney");
    await s.page.locator('.pane-answer [data-banner="rank-floor"]').first().waitFor({ timeout: 120000 });
    await into(s, ".pane-answer");
  } },
  { name: "results-analysed-rows", setup: async (s) => {
    const rows = Array.from({ length: 12 }, (_, i) => [[3, 7, 10].includes(i + 1) ? "" : String(30 + 3 * i),
      (1 + 0.7 * i + ((i * 7) % 5) * 0.3).toFixed(1), (4 + 0.8 * i + (i % 3) * 0.6).toFixed(2)].join("\t"));
    await pastedTable(s, "multivariable", "Dose study with blanks", `Age\tDose\tY\n${rows.join("\n")}\n`);
    await click(s, button(s, "Analyze"));
    await click(s, s.page.getByRole("menuitem", { name: /Multiple linear regression/ }));
    await s.page.locator(".notes-strip .analysed-line").first().waitFor({ timeout: 120000 });
    await settle(s, 2000);
    await into(s, ".pane-results .notes-strip", "center");
  } },
  { name: "results-ratio-ttest", setup: async (s) => {
    await pastedTable(s, "column", "Control and treated",
      "Control\tTreated\n100\t60\n95\t70\n105\t65\n98\t55\n102\t75\n");
    await s.page.locator(".pane-controls select.analysis-select").selectOption("ttest");
    await s.page.locator(".pane-results tr", { hasText: "CI of ratio (Fieller)" }).first().waitFor({ timeout: 120000 });
    await into(s, ".pane-results .result-card", "start");
  } },
  { name: "results-ratio-dunnett", setup: async (s) => {
    await pastedTable(s, "column", "Dose groups",
      "Control\tLow\tMid\tHigh\n100\t92\t80\t60\n95\t88\t76\t70\n105\t97\t85\t65\n98\t90\t79\t55\n102\t95\t83\t75\n");
    await s.page.locator(".pane-controls select.analysis-select").selectOption("anova");
    await s.page.locator(".pane-controls label.check-row", { has: s.page.locator('span:text-is("Multiple comparisons")') })
      .locator("select").selectOption("dunnett");
    await s.page.locator(".pane-results .ratio-table").first().waitFor({ timeout: 120000 });
    await into(s, ".pane-results .ratio-table", "center");
  } },
  // tests (wave 1): equivalence (P-12), comparing regression lines
  // (P-13), pairs of rows of a contingency table (P-14), two event rates
  // (P-47)
  { name: "results-equivalence", setup: async (s) => {
    await pastedTable(s, "column", "Equivalence",
      "A\tB\n10.8\t10.6\n10.75\t10.55\n10.55\t10.35\n10.5\t10.3\n9.6\t9.4\n9.65\t9.45\n9.85\t9.65\n9.9\t9.7\n");
    const c = s.page.locator(".pane-controls");
    await c.locator("select.analysis-select").selectOption("ttest");
    await c.getByLabel("Equivalence test").selectOption("equivalence");
    await c.getByLabel(/^Margin/).fill("1");
    await s.page.locator(".pane-results .equivalence-strip").first().waitFor({ timeout: 120000 });
    await settle(s, 800);
    await into(s, ".pane-answer", "start");
  } },
  { name: "results-equivalence-table", setup: async (s) => {
    await pastedTable(s, "column", "Equivalence",
      "A\tB\n10.8\t10.6\n10.75\t10.55\n10.55\t10.35\n10.5\t10.3\n9.6\t9.4\n9.65\t9.45\n9.85\t9.65\n9.9\t9.7\n");
    const c = s.page.locator(".pane-controls");
    await c.locator("select.analysis-select").selectOption("ttest");
    await c.getByLabel("Equivalence test").selectOption("equivalence");
    await c.getByLabel(/^Margin/).fill("0.5");
    await s.page.locator(".pane-results .equivalence-strip").first().waitFor({ timeout: 120000 });
    await settle(s, 800);
    await into(s, ".pane-results .equivalence-results", "start");
  } },
  // fit models (wave 1): Weibull and hormesis models (P-19), range
  // constraints (P-20), initial values and the fit report (P-21),
  // simulating a user-defined equation (P-51)
  { name: "results-weibull", setup: async (s) => {
    const rye = JSON.parse(readFileSync(join(FIXTURES, "..", "..", "engine", "tests", "fixtures",
      "drc_datasets.json"), "utf8")).ryegrass;
    await pastedTable(s, "xy", "Ryegrass", "conc\trootl\n"
      + rye.conc.map((c, i) => `${c}\t${rye.rootl[i]}`).join("\n") + "\n", 1);
    await click(s, s.page.getByRole("button", { name: /^Model:/ }));
    await s.page.getByRole("combobox", { name: "Search models" }).fill("weibull type 1");
    await s.page.getByRole("option", { name: /Weibull type 1 \(W1\.4\)/ }).click();
    await s.page.locator('.pane-results[data-live="true"] .fit-note').first().waitFor({ timeout: 120000 });
    await settle(s, 800);
    await into(s, ".pane-results .result-card .results-table", "start");
  } },
  { name: "results-fit-starts", setup: async (s) => {
    await example(s);
    const fold = s.page.locator(".pane-results details.fit-starts").first();
    await click(s, fold.locator("summary"));
    await into(s, ".pane-results details.fit-starts", "start");
  } },
  { name: "controls-range-constraint", setup: async (s) => {
    await example(s);
    const c = s.page.locator(".pane-controls");
    await click(s, c.locator(".constraint-row", { hasText: "Bottom = constant" }).locator('input[type="checkbox"]'));
    await c.getByRole("radio", { name: "Greater than" }).check();
    await c.getByLabel("Bottom greater than").fill("0");
    await c.getByLabel("Why Bottom cannot go past this").fill("signal cannot be negative");
    await waitLive(s);
    await into(s, ".pane-controls .constraint-range", "center");
  } },
  { name: "controls-range-reason-missing", setup: async (s) => {
    await example(s);
    const c = s.page.locator(".pane-controls");
    await click(s, c.locator(".constraint-row", { hasText: "HillSlope = constant" }).locator('input[type="checkbox"]'));
    await c.getByRole("radio", { name: "Between" }).check();
    await c.getByLabel("HillSlope greater than").fill("-3");
    await c.getByLabel("HillSlope less than").fill("-0.3");
    await c.getByLabel("Why HillSlope cannot go past this").focus();
    await c.getByLabel("HillSlope less than").focus();
    await into(s, ".pane-controls .constraint-range", "center");
  } },
  { name: "results-at-constraint", setup: async (s) => {
    const X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5];
    const R = [[101.2, 98.4, 99.6], [97.9, 100.8, 96.5], [95.1, 92.3, 96.8], [84.0, 80.2, 86.9],
      [55.3, 60.8, 52.1], [24.7, 28.9, 21.6], [7.9, 3.1, 5.6], [-1.2, 2.4, -3.9], [-4.8, -1.1, -6.3]];
    await pastedTable(s, "xy", "Negative bottom", "logX\tSignal\n"
      + X.flatMap((x, i) => R[i].map((y) => `${x}\t${y}`)).join("\n") + "\n", 1);
    await click(s, s.page.getByRole("button", { name: /^Model:/ }));
    await s.page.getByRole("combobox", { name: "Search models" }).fill("inhibitor variable four");
    await s.page.getByRole("option", { name: /log\(inhibitor\) vs\. response -- Variable slope \(four/ }).click();
    const c = s.page.locator(".pane-controls");
    const logX = c.getByLabel("X values are already log10(concentration)");
    if (!(await logX.isChecked())) await logX.check();
    await c.locator(".constraint-row", { hasText: "Bottom = constant" }).locator('input[type="checkbox"]').check();
    await c.getByRole("radio", { name: "Greater than" }).check();
    await c.getByLabel("Bottom greater than").fill("0");
    await c.getByLabel("Why Bottom cannot go past this").fill("signal cannot be negative");
    await s.page.locator(".pane-results .results-table", { hasText: "at its constraint" }).first()
      .waitFor({ timeout: 120000 });
    await settle(s, 800);
    await into(s, ".pane-results .result-card .results-table", "start");
  } },
  { name: "controls-initial-values", setup: async (s) => {
    await example(s);
    const c = s.page.locator(".pane-controls");
    await click(s, c.locator("details.initial-values > summary"));
    await c.getByLabel("LogIC50 start").fill("-5");
    await waitLive(s);
    await into(s, ".pane-controls details.initial-values", "start");
  } },
  { name: "sim-user-equation", setup: async (s) => {
    await example(s);
    await click(s, s.page.getByRole("button", { name: /^Model:/ }));
    await s.page.getByRole("combobox", { name: "Search models" }).fill("own equation");
    await s.page.getByRole("option", { name: /Enter your own equation/ }).click();
    const eq = dialog(s, "User-defined equation");
    await eq.getByLabel("Name").fill("Decay");
    await eq.getByLabel("Equation", { exact: true }).fill("Y = A*exp(-k*X)");
    await eq.getByText("Equation is valid").waitFor({ timeout: 30000 });
    await eq.getByRole("button", { name: /Save to my equations/ }).click();
    await eq.getByRole("button", { name: "Cancel" }).click();
    const nd = await newTableDialog(s);
    await nd.getByRole("button", { name: "Simulate data…" }).click();
    const sim = s.page.locator(".simulate-dialog");
    await sim.locator("label.field").filter({ has: s.page.locator("span", { hasText: /^Model$/ }) })
      .locator("select").selectOption({ label: "Decay" });
    await sim.getByLabel("A", { exact: true }).fill("100");
    await sim.getByLabel("k", { exact: true }).fill("0.3");
    await settle(s, 500);
  } },
  { name: "results-compare-lines", setup: async (s) => {
    await pastedTable(s, "xy", "Two lines",
      "X\tControl\tTreated\n1\t3.1\t6.0\n2\t5.2\t7.7\n3\t6.8\t10.1\n4\t9.1\t11.8\n5\t11.0\t14.2\n6\t12.7\t15.9\n7\t15.2\t17.8\n8\t16.9\t20.1\n", 1);
    await click(s, button(s, "Analyze"));
    await click(s, s.page.getByRole("menuitem", { name: /^Linear regression/ }));
    await s.page.locator(".pane-controls").getByLabel("Compare slopes and intercepts (two or more data sets)").check();
    await s.page.locator(".pane-results .compare-lines-table").first().waitFor({ timeout: 120000 });
    await settle(s, 800);
    await into(s, ".pane-results .compare-lines", "start");
  } },
  { name: "results-pairwise-rows", setup: async (s) => {
    await pastedTable(s, "contingency", "Genotypes",
      "Genotype\tPositive\tNegative\nWT\t18\t2\nHet\t15\t5\nKO\t5\t15\n");
    await s.page.locator(".pane-controls").getByLabel("Correction").selectOption("holm");
    await s.page.locator(".pane-results .pairwise-table").first().waitFor({ timeout: 120000 });
    await settle(s, 800);
    await into(s, ".pane-results .pairwise-rows", "start");
  } },
  { name: "dialog-event-rates", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Analyze"));
    await click(s, s.page.getByRole("menuitem", { name: "Compare two event rates…" }));
    const dlg = s.page.getByRole("dialog", { name: "Compare two event rates" });
    await dlg.getByLabel("Exposure unit").fill("hours");
    await dlg.getByLabel("Events in group 1").fill("23");
    await dlg.getByLabel("Exposure of group 1").fill("10");
    await dlg.getByLabel("Events in group 2").fill("41");
    await dlg.getByLabel("Exposure of group 2").fill("12");
    await dlg.locator(".rates-table").waitFor({ timeout: 120000 });
    await settle(s, 600);
  } },
  // the eLife checklist on the example: source data per figure is not met
  // and links to the export bundle (P-09)
  { name: "results-checklist-elife", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Journal checklists"));
    const d = dialog(s, "Journal checklists");
    await d.getByRole("tab", { name: /eLife/ }).click();
    await d.locator(".checklist li").filter({ hasText: "Source data available" }).scrollIntoViewIfNeeded();
  } },
  // the study design record on an info sheet (P-61): blinding of data
  // analysis not stated, a long criteria text
  { name: "info-study-design", setup: async (s) => {
    await fixture(s, "study-design.json");
    await s.page.locator(".design-sheet").waitFor({ timeout: 30000 });
    await into(s, ".design-sheet", "start");
  } },
  // ARRIVE items 4 and 8 met from the record, item 5 not (one stage open)
  { name: "results-checklist-arrive", setup: async (s) => {
    await fixture(s, "study-design.json");
    await selectSheet(s, "t test of Tumour volume");
    await waitLive(s);
    await click(s, button(s, "Journal checklists"));
    const d = dialog(s, "Journal checklists");
    await d.getByRole("tab", { name: /ARRIVE/ }).click();
    await d.locator(".checklist li").filter({ hasText: "4. Randomisation" }).scrollIntoViewIfNeeded();
  } },
  // an Info constant used as "@Expected_weight" in the one-sample value
  { name: "results-info-constant", setup: async (s) => {
    await fixture(s, "row-ids.json");
    await selectSheet(s, "Descriptive statistics of Body weight by animal");
    await waitLive(s);
    await click(s, s.page.locator(".constants-list > summary"));
    await into(s, ".constants-list", "center");
  } },
  // a project reopened with Help me choose's saved reason (P-32): the
  // Why this test note in the Checks row, and the methods paragraph
  { name: "results-why-saved", setup: async (s) => {
    await fixture(s, "why-history.json", { live: true });
    const d = s.page.locator(".pane-answer details.checks").first();
    if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
    await s.page.getByRole("note", { name: "Why this test" }).waitFor();
    await into(s, ".results-why", "center");
  } },
  { name: "results-methods-why", setup: async (s) => {
    await fixture(s, "why-history.json", { live: true });
    await s.page.locator(".stats-methods p").filter({ hasText: "Choice of test" }).waitFor({ timeout: 60000 });
    await into(s, ".stats-methods", "center");
  } },
  // the project's saved reproduction record in History (P-58)
  { name: "results-history-saved", setup: async (s) => {
    await fixture(s, "why-history.json", { live: true });
    await click(s, button(s, "History").first());
    const d = dialog(s, "History");
    await d.locator(".history-reproduction").scrollIntoViewIfNeeded();
  } },

  // ---- graphs
  { name: "graphs-contingency", setup: async (s) => {
    await fixture(s, "row-ids.json");
    await selectSheet(s, "Graph of Response by treatment");
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    await settle(s, 1000);
  } },
  // pairs of rows (Holm) as brackets on the stacked percent graph (P-14)
  { name: "graphs-contingency-brackets", setup: async (s) => {
    await fixture(s, "contingency-brackets.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
      .some((a) => a.name === "bracket-label"), null, { timeout: 120000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1000);
  } },
  // the t test's equivalence margin and 90% CI on the estimation plot (P-12)
  { name: "graphs-estimation-margins", setup: async (s) => {
    await fixture(s, "estimation-margins.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
      .some((x) => x.name === "equivalence-margin:upper"), null, { timeout: 180000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1000);
  } },
  { name: "graphs-graph-sheet", setup: async (s) => {
    await example(s);
    await selectSheet(s, "Graph of Dose response");
    await s.page.locator(".js-plotly-plot").first().waitFor();
  } },
  { name: "graphs-long-titles", setup: async (s) => {
    await fixture(s, "long-names.json", { live: true });
    await selectSheet(s, /^Graph: concentration-response curves/);
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await settle(s, 1500);
  } },
  { name: "graphs-settings", setup: async (s) => {
    await example(s);
    await into(s, ".plot-card", "center");
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: "Settings", exact: true }));
    await dialog(s, "Graph settings").waitFor();
  } },
  { name: "graphs-box-whiskers", setup: async (s) => {
    await fixture(s, "box-plot.json", { live: true });
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: "Settings", exact: true }));
    await dialog(s, "Graph settings").getByLabel("Whiskers").waitFor();
  } },
  { name: "graphs-fit-figure", setup: async (s) => {
    await fixture(s, "fit-graph.json", { live: true });
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  { name: "graphs-bar-axis-note", setup: async (s) => {
    await fixture(s, "bar-axis.json", { live: true });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Bars without zero/ }));
    await s.page.getByRole("region", { name: "Bars without zero" }).waitFor();
    await into(s, ".pane-answer details.checks", "center");
    await settle(s, 800);
  } },
  // a new Normalize output's graph: Y title and legend "% of vehicle (mean)" (P-55)
  { name: "graphs-normalize-title", setup: async (s) => {
    await fixture(s, "normalize-title.json");
    await s.page.waitForFunction(() => {
      const t = document.querySelector(".plot-card .plot")?.layout?.yaxis?.title;
      return (typeof t === "string" ? t : t?.text) === "% of vehicle (mean)";
    }, null, { timeout: 120000 });
    await into(s, ".plot-card", "start");
    await settle(s, 1200);
  } },
  // rows F and M: the Checks row asks whether they are sex (P-62)
  { name: "results-sex-question", setup: async (s) => {
    await fixture(s, "sex-factor.json", { live: true });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Are rows F and M sex\?/ }));
    await s.page.getByRole("region", { name: /Are rows F and M sex\?/ }).waitFor();
    await into(s, ".pane-answer details.checks", "center");
    await settle(s, 800);
  } },
  { name: "results-rank-line", setup: async (s) => {
    await fixture(s, "rank-test.json", { live: true });
    await s.page.locator(".pane-answer .answer-rank").waitFor();
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await settle(s, 1200);
  } },
  { name: "graphs-format-axes-pt", setup: async (s) => {
    await example(s);
    await into(s, ".plot-card", "center");
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: "Settings", exact: true }));
    await click(s, dialog(s, "Graph settings").getByRole("button", { name: "Format axes…" }));
    const fmt = s.page.locator("dialog.fmt-dialog");
    await click(s, fmt.getByLabel("Points (pt, 1/72 inch"));
    await fmt.getByLabel("Axis line width (pt)").fill("1");
    await settle(s, 500);
  } },
  { name: "results-schild", setup: async (s) => {
    await fixture(s, "schild.json", { live: true });
    const card = s.page.locator(".schild-card");
    await card.waitFor({ timeout: 240000 });
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 600);
  } },
  { name: "results-rm-sphericity", setup: async (s) => {
    // P-40: Huynh-Feldt epsilon and Mauchly's test in the table and the chip
    await fixture(s, "rm-reporting.json", { live: true });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Sphericity: ε =/ }));
    await s.page.getByRole("region", { name: /Sphericity: ε =/ }).waitFor();
    await into(s, ".pane-answer details.checks", "center");
    await settle(s, 800);
  } },
  { name: "results-rm-two-way-sphericity", setup: async (s) => {
    await fixture(s, "rm-reporting.json", { live: true });
    await selectSheet(s, "Two-way RM ANOVA of Metric by time");
    await s.page.locator(".pane-results h4", { hasText: "Sphericity" }).waitFor({ timeout: 240000 });
    await s.page.locator(".pane-results h4", { hasText: "Sphericity" }).first()
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  { name: "results-ordered-trend", setup: async (s) => {
    // P-41: Jonckheere-Terpstra after Kruskal-Wallis, its order in the controls
    await fixture(s, "rm-reporting.json", { live: true });
    await selectSheet(s, "Kruskal-Wallis of Four doses");
    const h = s.page.locator(".pane-results h4", { hasText: "Trend across ordered columns" });
    await h.waitFor({ timeout: 240000 });
    await h.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  { name: "results-page-trend", setup: async (s) => {
    await fixture(s, "rm-reporting.json", { live: true });
    await selectSheet(s, "Friedman of Teaching methods");
    const h = s.page.locator(".pane-results h4", { hasText: "Page's test" });
    await h.waitFor({ timeout: 240000 });
    await h.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  { name: "results-cochran-q", setup: async (s) => {
    // P-45: Cochran's Q and the Holm-adjusted McNemar tests
    await fixture(s, "rm-reporting.json", { live: true });
    await selectSheet(s, "Cochran's Q of Three stains");
    const h = s.page.locator(".pane-results h3", { hasText: "Cochran's Q test" });
    await h.waitFor({ timeout: 240000 });
    await h.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  { name: "results-rm-corr", setup: async (s) => {
    // P-27: repeated-measures correlation with its Subject role
    await fixture(s, "rm-reporting.json", { live: true });
    await selectSheet(s, "Correlation of pH and PaCO2");
    const h = s.page.locator(".pane-results h3", { hasText: "Repeated-measures correlation" });
    await h.waitFor({ timeout: 240000 });
    await h.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  { name: "results-passing-bablok", setup: async (s) => {
    // P-42: Passing-Bablok beside Theil-Sen and Deming, the CUSUM test, the graph
    await fixture(s, "method-comparison.json", { live: true });
    const h = s.page.locator(".pane-results h3", { hasText: "Passing-Bablok regression" });
    await h.waitFor({ timeout: 240000 });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .some((t) => t.meta?.odTag?.role === "fit"), null, { timeout: 240000 });
    await h.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  { name: "results-ba-ccc", setup: async (s) => {
    // P-43: Lin's CCC with its caveat in the Bland-Altman results, and the
    // link to Passing-Bablok of the same columns (P-42)
    await fixture(s, "method-comparison.json", { live: true });
    await selectSheet(s, "Bland-Altman of Ejection");
    const row = s.page.locator(".pane-results th", { hasText: "Lin's concordance correlation" });
    await row.waitFor({ timeout: 240000 });
    await row.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 800);
  } },
  { name: "results-icc", setup: async (s) => {
    // P-44: the six ICCs, the chosen form in the headline, the form select
    await fixture(s, "method-comparison.json", { live: true });
    await selectSheet(s, "ICC of Shrout-Fleiss");
    const h = s.page.locator(".pane-results h3", { hasText: "Intraclass correlation" });
    await h.waitFor({ timeout: 240000 });
    await h.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  { name: "graphs-schild", setup: async (s) => {
    await fixture(s, "schild.json", { live: true });
    await selectSheet(s, /^Schild plot of EC50 shift/);
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .some((t) => t.meta?.odTag?.role === "fit"), null, { timeout: 240000 });
    await into(s, ".plot-card", "center");
    await settle(s, 800);
  } },
  { name: "graphs-raincloud", setup: async (s) => {
    await fixture(s, "raincloud.json", { live: true });
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: "Settings", exact: true }));
    await dialog(s, "Graph settings").getByLabel("Whiskers").waitFor();
  } },
  { name: "graphs-fit-legend", setup: async (s) => {
    await fixture(s, "fit-legend.json", { live: true });
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  // drop lines on the segment of a broken Y axis that holds the IC50 (P-23)
  { name: "graphs-fit-split-axis", setup: async (s) => {
    await fixture(s, "fit-split-axis.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
      .some((x) => x.name === "drop:0:v2"), null, { timeout: 120000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  { name: "graphs-fit-drop-lines", setup: async (s) => {
    await fixture(s, "fit-graph.json", { live: true });
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: "Settings", exact: true }));
    await dialog(s, "Graph settings").getByRole("checkbox", { name: "Show IC50 drop lines" }).waitFor();
  } },
  { name: "graphs-export-options", setup: async (s) => {
    await example(s);
    await into(s, ".plot-card", "center");
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: "Options", exact: true }));
    await dialog(s, "Export options").waitFor();
  } },
  { name: "graphs-layout", setup: async (s) => {
    await fixture(s, "long-names.json", { live: true });
    await selectSheet(s, /^Figure 2: viability/);
    await s.page.locator(".js-plotly-plot").first().waitFor({ timeout: 60000 });
    await settle(s, 2000);
  } },

  // ---- guided flows
  { name: "guided-which-test", setup: async (s) => {
    await example(s);
    await analyzeItem(s, /^Help me choose/);
    await dialog(s, "Help me choose a test").waitFor();
  } },
  { name: "guided-plan", setup: async (s) => {
    await example(s);
    await analyzeItem(s, /^Plan an experiment/);
    await dialog(s, "Plan an experiment").waitFor();
  } },
  { name: "guided-describe", setup: async (s) => {
    await start(s);
    await headerMenu(s, "File", "Describe your experiment…");
    await s.page.locator(".design-dialog").waitFor();
  } },
  { name: "guided-assay-wizard", setup: async (s) => {
    await example(s);
    const dlg = await newTableDialog(s);
    await dlg.getByRole("radio", { name: "Start from an assay" }).check();
    await dlg.getByRole("radio", { name: /^qPCR \(ΔCq/ }).check();
    await dlg.getByRole("button", { name: "Start assay" }).click();
    const wiz = s.page.locator("dialog.assay-wizard");
    await wiz.waitFor({ timeout: 30000 });
    for (let i = 0; i < 2; i++) {
      const next = wiz.getByRole("button", { name: "Next", exact: true });
      if (!(await next.count()) || await next.isDisabled()) break;
      await next.click();
      await s.page.waitForTimeout(400);
    }
    await settle(s, 1500);
  } },
  // P-06 in an assay picker: the densitometry export as the AutoFilter
  // workbook, its filtered rows left out and reported
  { name: "guided-assay-workbook-report", setup: async (s) => {
    await example(s);
    const dlg = await newTableDialog(s);
    await dlg.getByRole("radio", { name: "Start from an assay" }).check();
    await dlg.getByRole("radio", { name: /^Western blot densitometry/ }).check();
    await dlg.getByText("An empty layout").click();
    await dlg.getByRole("button", { name: "Start assay" }).click();
    const wiz = s.page.locator("dialog.assay-wizard");
    await wiz.waitFor({ timeout: 30000 });
    await wiz.locator('input[aria-label="Densitometry export"]').setInputFiles(join(FIXTURES, "xlsx", "filter-hidden.xlsx"));
    await wiz.locator(".workbook-report").filter({ hasText: /hidden by a filter/ }).waitFor({ timeout: 120000 });
    await settle(s, 500);
  } },
  // P-29: an ELISA with 20 blank and 20 low-sample wells: LoB, LoD, LoQ
  // on the results sheet, and the wizard's Blanks and low samples step
  { name: "guided-std-limits", setup: async (s) => {
    await fixture(s, "detection-limits.json", { live: true });
    await s.page.locator(".std-limits").first().waitFor({ timeout: 120000 });
    await into(s, ".std-results .plate-qc-grid");
    await settle(s);
  } },
  { name: "guided-std-limits-step", setup: async (s) => {
    await fixture(s, "detection-limits.json", { live: true });
    await s.page.locator(".std-limits").first().waitFor({ timeout: 120000 });
    await click(s, button(s, "Open setup wizard…"));
    const wiz = s.page.locator("dialog.assay-wizard");
    await wiz.waitFor();
    await wiz.getByRole("button", { name: /Blanks and low samples/ }).click();
    await wiz.locator(".assay-preview").waitFor({ timeout: 60000 });
    await settle(s, 1000);
  } },
  // P-29, qPCR: the LoD95 of a hit-rate dilution series
  { name: "guided-qpcr-lod", setup: async (s) => {
    await fixture(s, "qpcr-lod.json", { live: true });
    await s.page.locator(".qpcr-lod").first().waitFor({ timeout: 120000 });
    await into(s, ".qpcr-lod");
    await settle(s);
  } },
  // P-30: NTC and no-RT controls, on the results sheet and in the QC step
  { name: "guided-qpcr-controls", setup: async (s) => {
    await fixture(s, "qpcr-controls.json", { live: true });
    await s.page.locator(".qpcr-controls").first().waitFor({ timeout: 120000 });
    await into(s, ".qpcr-results .qpcr-controls");
    await settle(s);
  } },
  { name: "guided-qpcr-controls-step", setup: async (s) => {
    await fixture(s, "qpcr-controls.json", { live: true });
    await s.page.locator(".qpcr-controls").first().waitFor({ timeout: 120000 });
    await click(s, button(s, "Open setup wizard…"));
    const wiz = s.page.locator("dialog.assay-wizard");
    await wiz.waitFor();
    await wiz.getByRole("button", { name: /QC and statistics/ }).click();
    await wiz.locator(".qpcr-controls").waitFor({ timeout: 60000 });
    await settle(s, 1000);
  } },
  // P-50: the flow event-count calculator, both parts filled
  { name: "guided-flow-events", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "Flow cytometry event counts…");
    const dlg = dialog(s, "Flow cytometry event counts");
    await dlg.waitFor();
    await dlg.getByLabel("Positive events", { exact: true }).fill("120");
    await dlg.getByLabel("Events in the parent gate").fill("50000");
    await s.page.waitForFunction(() => /Wilson/.test(document.querySelectorAll(".flow-events .flow-events-out")[1]
      ?.textContent ?? ""), null, { timeout: 60000 });
    await settle(s);
  } },
  { name: "guided-tour", setup: async (s) => {
    await example(s);
    await headerMenu(s, "View", "Help and tour");
    await button(s, "Take the tour").click();
    await s.page.locator(".tour-card").waitFor();
    await s.page.locator(".tour-next").click();
    await s.page.locator(".tour-next").click();
    await s.page.locator('.tour[data-step="3"]').waitFor();
    await settle(s, 800);
  } },
  { name: "guided-power", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "Power and sample size…");
    await s.page.locator("dialog[open]").first().waitFor();
  } },
];

// ------------------------------------------------------------ runner

const pick = (name) => !ONLY || ONLY.some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : name === p));
if (LIST) {
  for (const sc of scenes) console.log(sc.name);
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });
const chosen = scenes.filter((sc) => pick(sc.name));
const browser = await chromium.launch();
const axeOut = [];
const errors = {};
const status = {};
const err = (scene, msg) => (errors[scene] ??= []).push(msg);

async function axe(s, scene, theme) {
  await s.page.evaluate(AXE_SRC).catch(() => {});
  const violations = await s.page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run({ include: [document], exclude: [...document.querySelectorAll(".js-plotly-plot")] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160),
        ...(v.id === "color-contrast" ? { why: (n.any[0]?.message ?? "").slice(0, 160) } : {}) })) }));
  }).catch((e) => [{ id: "axe-failed", impact: "n/a", help: e.message.split("\n")[0], nodes: [] }]);
  axeOut.push({ scene, width: s.vp.width, theme, count: violations.reduce((a, v) => a + v.nodes.length, 0), violations });
}

/** The page background must follow the emulated scheme (the app's theme
 *  preference is "auto"): a light page in a dark shot is a theme bug. */
async function themeCheck(s, scene, theme) {
  const probe = () => {
    // the page background (body: var(--page)) and the CSS color-scheme
    // resolved to sRGB bytes through a canvas: the tokens are oklch()
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d");
    cx.fillStyle = getComputedStyle(document.body).backgroundColor;
    cx.fillRect(0, 0, 1, 1);
    const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
    return { lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, attr: document.documentElement.dataset.theme ?? "",
      scheme: getComputedStyle(document.documentElement).colorScheme };
  };
  // a busy page (a large plot redrawing) can take a moment to restyle
  const ok = await s.page.waitForFunction(`(${probe})().lum ${theme === "dark" ? "<" : ">="} 0.5`, null,
    { timeout: 10000, polling: 250 }).then(() => true, () => false);
  if (!ok) {
    const got = await s.page.evaluate(probe);
    err(scene, `${s.vp.width} ${theme}: page background has luminance ${got.lum.toFixed(2)}, `
      + `color-scheme "${got.scheme}", data-theme="${got.attr}"`);
  }
}

async function runScene(sc) {
  const t0 = Date.now();
  for (const vp of [WIDE, PHONE]) {
    const context = await browser.newContext({ viewport: vp, colorScheme: "light", serviceWorkers: "block",
      reducedMotion: MOTION ? "no-preference" : "reduce", acceptDownloads: true,
      ...(vp === PHONE ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) });
    const page = await context.newPage();
    page.on("pageerror", (e) => err(sc.name, `${vp.width} pageerror: ${e.message.split("\n")[0]}`));
    page.on("console", (m) => {
      if (m.type() === "error") err(sc.name, `${vp.width} console: ${m.text().slice(0, 240)}`);
    });
    const s = { page, context, vp, phone: vp === PHONE };
    try {
      await sc.setup(s);
      await settle(s);
      for (const theme of THEMES) {
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForTimeout(MOTION ? 700 : 350);
        await themeCheck(s, sc.name, theme);
        // an analysis rerun by the switch (a large table) finishes before the shot
        await page.waitForFunction(() => !document.querySelector(".analysis-busy:not(.cancelled)"), null,
          { timeout: 60000, polling: 500 }).catch(() => err(sc.name, `${vp.width} ${theme}: still computing at the shot`));
        await page.screenshot({ path: join(OUT, `${sc.name}-${vp.width}-${theme}.png`), fullPage: !!sc.full });
        await axe(s, sc.name, theme);
      }
      if (vp === PHONE) {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) err(sc.name, `390: page scrolls sideways by ${over}px`);
      }
    } catch (e) {
      const msg = e.message.split("\n")[0];
      err(sc.name, `${vp.width} FAILED: ${msg}`);
      await page.screenshot({ path: join(OUT, `${sc.name}-FAILED.png`) }).catch(() => {});
      status[sc.name] = { ok: false, error: `${vp.width}: ${msg}` };
      await context.close().catch(() => {});
      console.log(`FAIL ${sc.name} (${vp.width}): ${msg}`);
      return;
    }
    await context.close().catch(() => {});
  }
  status[sc.name] = { ok: true, seconds: Math.round((Date.now() - t0) / 1000) };
  console.log(`ok   ${sc.name} (${status[sc.name].seconds} s)`);
}

const queue = [...chosen];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) await runScene(queue.shift());
}));
await browser.close();

// ------------------------------------------------------------ reports

const order = chosen.map((sc) => sc.name);
const axeBy = (name) => axeOut.filter((a) => a.scene === name);
axeOut.sort((a, b) => order.indexOf(a.scene) - order.indexOf(b.scene) || b.width - a.width || a.theme.localeCompare(b.theme));
const summary = Object.fromEntries(order.map((n) => [n, axeBy(n).reduce((a, x) => a + x.count, 0)]));
writeFileSync(join(OUT, "axe.json"), JSON.stringify({ summary, shots: axeOut }, null, 1));
writeFileSync(join(OUT, "errors.json"), JSON.stringify(
  Object.fromEntries(order.filter((n) => errors[n]).map((n) => [n, [...new Set(errors[n])]])), null, 1));

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
const cell = (name, w, theme) => {
  const f = `${name}-${w}-${theme}.png`;
  return `<figure><a href="${f}"><img loading="lazy" src="${f}" alt="${esc(`${name}, ${w} px, ${theme}`)}"></a>`
    + `<figcaption>${w} ${theme} · axe ${axeBy(name).find((a) => a.width === w && a.theme === theme)?.count ?? "–"}</figcaption></figure>`;
};
const rows = order.map((name) => {
  const st = status[name];
  const body = st?.ok
    ? [1400, 390].flatMap((w) => THEMES.map((t) => cell(name, w, t))).join("")
    : `<figure class="failed"><a href="${name}-FAILED.png"><img loading="lazy" src="${name}-FAILED.png" alt="${esc(name)} failed"></a>`
      + `<figcaption>${esc(st?.error ?? "not run")}</figcaption></figure>`;
  const notes = (errors[name] ?? []).length;
  return `<section id="${name}"><h2><a href="#${name}">${esc(name)}</a>`
    + `<span>${st?.ok ? `${st.seconds} s` : "FAILED"} · axe ${summary[name]} · errors ${notes}</span></h2>`
    + `<div class="row">${body}</div></section>`;
}).join("\n");
writeFileSync(join(OUT, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenDose stage</title>
<style>
:root { color-scheme: light dark; --bg: #f5f5f7; --fg: #1d1d1f; --muted: #6e6e73; --card: #fff; --line: #d2d2d7; }
@media (prefers-color-scheme: dark) { :root { --bg: #111113; --fg: #f5f5f7; --muted: #a1a1a6; --card: #1c1c1e; --line: #38383a; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
header p { color: var(--muted); margin: 4px 0 16px; }
nav { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 24px; font-size: 13px; }
a { color: inherit; }
section { margin-bottom: 28px; }
h2 { font-size: 15px; margin: 0 0 8px; display: flex; gap: 12px; align-items: baseline; }
h2 span { color: var(--muted); font-weight: 400; font-size: 13px; font-variant-numeric: tabular-nums; }
.row { display: grid; grid-template-columns: 3fr 3fr 1fr 1fr; gap: 10px; align-items: start; }
figure { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px; }
figure.failed { grid-column: 1 / -1; border-color: #d70015; }
img { display: block; width: 100%; height: auto; border-radius: 4px; }
figcaption { color: var(--muted); font-size: 12px; margin-top: 4px; font-variant-numeric: tabular-nums; }
@media (max-width: 700px) { .row { grid-template-columns: 1fr 1fr; } }
</style></head><body>
<header><h1>OpenDose stage</h1>
<p>${order.length} scenes · ${order.filter((n) => status[n]?.ok).length} rendered · motion ${MOTION ? "on" : "reduced"} · ${esc(baseUrl)} · ${new Date().toISOString()} · <a href="axe.json">axe.json</a> · <a href="errors.json">errors.json</a></p></header>
<nav>${order.map((n) => `<a href="#${n}">${esc(n)}</a>`).join("")}</nav>
${rows}
</body></html>
`);

const failed = order.filter((n) => !status[n]?.ok);
console.log(`\n${order.length - failed.length}/${order.length} scenes in ${OUT} (contact sheet: index.html)`);
console.log(`axe-core: ${Object.values(summary).reduce((a, b) => a + b, 0)} violation nodes`);
if (failed.length) console.log(`failed: ${failed.join(", ")}`);
process.exitCode = failed.length ? 1 : 0;
