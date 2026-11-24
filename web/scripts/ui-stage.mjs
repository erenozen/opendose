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
/** The Share dialog of a t test project (why-history.json), made an
 *  exercise with a task (P-126). Returns the dialog. */
async function exerciseDialog(s) {
  await fixture(s, "why-history.json", { live: true });
  await headerMenu(s, "File", "Copy share link…");
  const d = dialog(s, "Share this project");
  await d.getByLabel("Protect with a password (recommended)").uncheck();
  await d.getByLabel(/Make it an exercise/).check();
  await d.getByLabel("Task for the student").fill("Pilot data from two groups of six mice. "
    + "Which test compares Control with Treated, and what does it conclude?");
  return d;
}
/** The student's view of that exercise link, opened in the same page. */
async function openExercise(s) {
  const d = await exerciseDialog(s);
  const link = await d.getByLabel("Share link").inputValue();
  await d.getByRole("button", { name: "Done" }).click();
  await s.page.goto(link);
  await s.page.locator(".shell").waitFor({ timeout: 60000 });
  await waitEngine(s);
  await s.page.getByRole("region", { name: "Exercise" }).waitFor({ timeout: 60000 });
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
/** Writes saved versions (project/versions.ts records) of the study in
 *  e2e-fixtures/project-study.json; `excluded` versions leave Control
 *  row 4 out of the table (the compare scene). */
async function seedVersions(s, versions) {
  const study = JSON.parse(readFileSync(join(FIXTURES, "project-study.json"), "utf8"));
  const out = versions.map((v) => {
    const p = structuredClone(study);
    if (v.excluded) {
      p.sheets[0].table.datasets[0].excluded = ["3:0"];
      p.sheets[0].table.datasets[0].exclusionReasons = { "3:0": "reviewer: pipetting error" };
    }
    if (v.title) p.title = v.title;
    return { id: v.id, savedAt: v.savedAt, title: p.title, note: v.note, sheets: p.sheets.length,
      json: JSON.stringify(p, null, 2) };
  });
  await s.page.evaluate(async (list) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("opendose", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("autosave"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction("autosave", "readwrite");
      for (const x of list) tx.objectStore("autosave").put(x, `version:${x.id}`);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, out);
  return out;
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
  // P-126: the Share dialog making an exercise link, then the student's
  // view of it (the task in place of the results) and after the answers
  { name: "shell-share-exercise", setup: async (s) => {
    await exerciseDialog(s);
    await settle(s, 800);
  } },
  { name: "results-exercise-withheld", setup: async (s) => {
    await openExercise(s);
    await settle(s, 1200);
  } },
  { name: "results-exercise-revealed", setup: async (s) => {
    await openExercise(s);
    await click(s, s.page.getByRole("region", { name: "Exercise" })
      .getByRole("button", { name: "Help me choose…" }));
    await dialog(s, "Help me choose a test").getByRole("button", { name: "Commit my answers" }).click();
    await s.page.getByRole("region", { name: /Your answers point to/ }).waitFor({ timeout: 60000 });
    await waitLive(s);
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
  // P-72: Save a version… after a submit with no note (the field's error)
  { name: "shell-save-version", setup: async (s) => {
    await example(s, { live: false });
    await headerMenu(s, "File", "Save a version…");
    const d = dialog(s, "Save a version");
    await d.getByRole("button", { name: "Save version" }).click();
    await d.getByText("Enter a note, such as “before reviewer”").waitFor();
  } },
  // P-72: Open recent…, a long title, a closed tab's session and versions
  { name: "shell-recent", setup: async (s) => {
    await example(s, { live: false });
    await seedSessions(s, [{ id: "stage-r", title: "Study", sheets: 2, sheet: "Viability",
      savedAt: Date.UTC(2026, 10, 24, 9, 12, 0) }]);
    await seedVersions(s, [
      { id: "v1", note: "before reviewer", savedAt: Date.UTC(2026, 10, 20, 14, 2, 0) },
      { id: "v2", note: "after reviewer: Control row 4 excluded for a pipetting error noted in the lab book on day 3",
        excluded: true, savedAt: Date.UTC(2026, 10, 23, 16, 40, 0) },
      { id: "v3", title: "Dose-response of compound XR-2231 in HepG2, MCF-7 and A549 cells, 72 h, replicate set 3",
        note: "submitted", savedAt: Date.UTC(2026, 10, 18, 8, 0, 0) },
    ]);
    await example(s, { live: false });
    await headerMenu(s, "File", "Open recent…");
    await dialog(s, "Recent projects").getByText("“before reviewer”").first().waitFor();
  } },
  // P-73: two versions compared, the log of what moved (engine live)
  { name: "shell-compare", setup: async (s) => {
    await example(s);
    const [a, b] = await seedVersions(s, [
      { id: "c1", note: "before reviewer", savedAt: Date.UTC(2026, 10, 20, 14, 2, 0) },
      { id: "c2", note: "after reviewer", excluded: true, savedAt: Date.UTC(2026, 10, 23, 16, 40, 0) },
    ]);
    await headerMenu(s, "File", "Compare with…");
    const d = dialog(s, "Compare two versions");
    const label = (v) => s.page.evaluate((x) => `Version “${x.note}” of “${x.title}”, ${new Date(x.savedAt).toLocaleString()}`, v);
    await d.getByLabel("Earlier").selectOption({ label: await label(a) });
    await d.getByLabel("Later").selectOption({ label: await label(b) });
    await d.getByRole("button", { name: "Compare", exact: true }).click();
    await d.getByRole("region", { name: "Differences" }).waitFor({ timeout: 240000 });
  } },
  // P-74: Add from project… with a file that differs in an info constant,
  // two preferences and a pinned colour (the dialog before adding)
  { name: "shell-add-project", setup: async (s) => {
    await start(s);
    const study = JSON.parse(readFileSync(join(FIXTURES, "project-study.json"), "utf8"));
    const colleague = {
      ...study, title: "Colleague",
      prefs: { ...study.prefs, digits: 6, report: { pStyle: "apa", hideNs: false, smd: "d", variance: "eta2", pFloor: "1e-4" } },
      groupColors: [{ name: "Control", color: "#0072b2" }],
      sheets: [...study.sheets, { id: "i9", kind: "info", name: "Assay info of the colleague's very long-named project",
        parentId: null, notes: "", constants: [{ name: "Dilution factor", value: "20" }] }],
    };
    // this project: its own dilution factor and pin
    const mine = { ...study, groupColors: [{ name: "Control", color: "#e69f00" }],
      sheets: [...study.sheets, { id: "i1", kind: "info", name: "Project info", parentId: null, notes: "",
        constants: [{ name: "Dilution factor", value: "10" }] }] };
    await s.page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
      { name: "study.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mine)) });
    await s.page.locator(".toast", { hasText: "Opened “study.json”" }).first().waitFor({ timeout: 30000 });
    const chooser = s.page.waitForEvent("filechooser");
    await headerMenu(s, "File", "Add from project…");
    await (await chooser).setFiles({ name: "colleague-dose-response-2026-11.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(colleague)) });
    await dialog(s, "Add “colleague-dose-response-2026-11.json” to this project?").waitFor();
  } },
  // P-75: Preferences › Lab kit, and the import dialog of a kit
  { name: "shell-preferences-kit", setup: async (s) => {
    await example(s, { live: false });
    await headerMenu(s, "View", "Preferences…");
    const prefs = dialog(s, "Preferences");
    await prefs.getByRole("button", { name: "Export lab kit" }).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 400);
  } },
  { name: "shell-lab-kit-import", setup: async (s) => {
    await example(s, { live: false });
    await headerMenu(s, "View", "Preferences…");
    const kit = {
      opendose_lab_kit: 1, exportedAt: "2026-11-24T09:30:00.000Z", software: "OpenDose 0.6.0",
      templates: [{ id: "user:a", name: "SRB plate", description: "", savedAt: 1, withData: false, tableName: "SRB",
        table: { type: "xy", datasets: [{ name: "A", rows: [[""]] }] }, results: [], graphs: [], info: [] }],
      recipes: [{ id: "r1", name: "Plate reader", savedAt: "", basis: "Plain import", spec: { kind: "plain" } },
        { id: "r2", name: "Incucyte", savedAt: "", basis: "Incucyte", spec: { kind: "plain" } }],
      plateLayouts: [{ name: "Our 96", format: 96, wells: { A1: { role: "blank" } }, description: "Saved layout (96 wells)" }],
      equations: [], preferences: { defaultTableType: "xy", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", theme: "auto", digits: 6 },
      exportSettings: { format: "tiff", width: 600, height: 450, dpi: 600, unit: "mm", transparent: false, paper: true, scaleText: false },
    };
    await dialog(s, "Preferences").locator('input[aria-label="Import a lab kit file"]').setInputFiles({
      name: "lab-kit-of-the-pharmacology-group-2026.odkit.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(kit)) });
    await dialog(s, "Import a lab kit").waitFor();
  } },
  // P-127: the validation page's reference datasets, and one opened
  { name: "shell-validation-datasets", setup: async (s) => {
    await example(s, { live: false });
    await headerMenu(s, "View", "About OpenDose…");
    await s.page.locator(".info-pop").getByRole("button", { name: "How OpenDose is validated" }).click();
    const v = dialog(s, "How OpenDose is validated");
    const sec = v.getByRole("region", { name: "Reference datasets you can open" });
    await sec.waitFor({ timeout: 15000 });
    await sec.locator("details").nth(0).evaluate((d) => { d.open = true; });
    await sec.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 400);
  } },
  { name: "shell-reference-dataset", setup: async (s) => {
    await example(s);
    await headerMenu(s, "View", "About OpenDose…");
    await s.page.locator(".info-pop").getByRole("button", { name: "How OpenDose is validated" }).click();
    await dialog(s, "How OpenDose is validated").getByRole("button", { name: "Open this dataset: Misra1a" }).click();
    await waitLive(s);
    await s.page.locator(".pane-results .results-table").first().waitFor({ timeout: 120000 });
    await settle(s, 1500);
  } },
  { name: "shell-reference-dataset-info", setup: async (s) => {
    await example(s, { live: false });
    await headerMenu(s, "View", "About OpenDose…");
    await s.page.locator(".info-pop").getByRole("button", { name: "How OpenDose is validated" }).click();
    await dialog(s, "How OpenDose is validated").getByRole("button", { name: "Open this dataset: Longley" }).first().click();
    await s.page.locator(".toast", { hasText: "Opened the reference dataset" }).first().waitFor({ timeout: 30000 });
    await s.page.keyboard.press("Control+k");
    await dialog(s, "Find a command or sheet").waitFor();
    await s.page.keyboard.type("Reference values");
    await s.page.keyboard.press("Enter");
    await s.page.locator(".info-main").first().waitFor({ timeout: 15000 });
    await settle(s, 600);
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
  { name: "results-download-menu", setup: async (s) => {
    // P-64: the strip's Download menu (CSV, TSV, Excel workbook)
    await example(s);
    await into(s, ".results-export-wrap");
    await s.page.locator(".results-export").getByRole("button", { name: "Download" }).click();
    await s.page.getByRole("menuitem", { name: /^Excel workbook/ }).waitFor();
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
  // twelve compounds (P-17): the fit summary above the cards, Compound L
  // flagged Extrapolated with its reason
  { name: "results-fit-summary", setup: async (s) => {
    await fixture(s, "fit-summary.json", { live: true });
    await s.page.locator(".fit-summary-table").first().waitFor({ timeout: 120000 });
    await into(s, ".fit-summary");
  } },
  // nlstools' vmkmki inhibition data (P-99): competitive vs mixed-model
  // inhibition, each fitted to all six data sets at once (I from the
  // titles), the nesting sentence, F test and AICc
  { name: "results-compare-global", setup: async (s) => {
    await fixture(s, "fit-compare.json", { live: true });
    await s.page.locator(".pane-results .compare-nesting").first().waitFor({ timeout: 120000 });
    await into(s, ".pane-results .compare-nesting");
  } },
  // drc's S.alba (P-100): glyphosate against bentazone from parallel 4PL
  // curves; margins set, the slope ratio misses its margin (the warn note)
  { name: "results-relative-potency", setup: async (s) => {
    await fixture(s, "fit-potency.json", { live: true });
    await s.page.locator(".pane-results .relative-potency").first().waitFor({ timeout: 120000 });
    await into(s, ".pane-results .relative-potency");
  } },
  { name: "controls-relative-potency", setup: async (s) => {
    await fixture(s, "fit-potency.json", { live: true });
    await s.page.locator(".potency-margins").first().waitFor({ timeout: 120000 });
    await into(s, ".potency-margins");
  } },
  // a BCA standard curve (quadratic) with three unknown rows (P-22): the
  // interpolated X with its CI and prediction interval, and the markers
  { name: "results-interpolation", setup: async (s) => {
    await fixture(s, "interpolation.json", { live: true });
    await s.page.locator(".interpolation-table").first().waitFor({ timeout: 120000 });
    await into(s, ".interpolation-card");
  } },
  { name: "graphs-interpolation", setup: async (s) => {
    await fixture(s, "interpolation.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .some((t) => String(t.name ?? "").endsWith("(unknowns)")), null, { timeout: 120000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  // the curve drawn from log dose -11 (P-52): dotted beyond the data, with
  // its confidence band; and the Curve fold of the fit controls
  { name: "graphs-curve-range", setup: async (s) => {
    await fixture(s, "curve-range.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .some((t) => String(t.name ?? "").endsWith("(beyond the data)")), null, { timeout: 120000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  { name: "controls-curve-range", setup: async (s) => {
    await fixture(s, "curve-range.json", { live: true });
    const fold = s.page.locator(".pane-controls details.curve-range");
    await fold.waitFor({ timeout: 120000 });
    await click(s, fold.locator("summary"));
    await into(s, ".pane-controls details.curve-range", "center");
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
  // bootstrap CIs of the example 4PL (P-101): the settings under the CI
  // method, the busy line with its progress bar, the results with the
  // bootstrap note and its details fold
  { name: "controls-bootstrap", setup: async (s) => {
    await example(s);
    const c = s.page.locator(".pane-controls");
    await click(s, c.locator("details.advanced > summary").first());
    await c.getByLabel("Confidence intervals").selectOption("bootstrap");
    await c.locator(".bootstrap-fields").waitFor({ timeout: 30000 });
    await into(s, ".pane-controls .bootstrap-fields", "center");
  } },
  { name: "results-bootstrap-progress", busy: true, setup: async (s) => {
    await example(s);
    const c = s.page.locator(".pane-controls");
    await click(s, c.locator("details.advanced > summary").first());
    await c.getByLabel("Confidence intervals").selectOption("bootstrap");
    await c.getByLabel("Resamples", { exact: true }).fill("10000");
    await s.page.locator(".analysis-busy progress").waitFor({ timeout: 60000 });
    await into(s, ".analysis-busy", "center");
  } },
  { name: "results-bootstrap", setup: async (s) => {
    await example(s);
    const c = s.page.locator(".pane-controls");
    await click(s, c.locator("details.advanced > summary").first());
    await c.getByLabel("Confidence intervals").selectOption("bootstrap");
    await s.page.locator('.pane-results[data-live="true"] .fit-bootstrap').first().waitFor({ timeout: 180000 });
    const fold = s.page.locator(".pane-results details.fit-bootstrap-detail").first();
    await click(s, fold.locator("summary"));
    await into(s, ".pane-results .result-card .results-table", "start");
    await settle(s, 600);
  } },
  // the parameters' correlation and covariance (P-102), the joint region
  // card and the region graph of LogIC50 and HillSlope
  { name: "results-fit-covariance", setup: async (s) => {
    await example(s);
    const fold = s.page.locator(".pane-results details.fit-covariance").first();
    await click(s, fold.locator("summary"));
    await into(s, ".pane-results details.fit-covariance", "start");
  } },
  { name: "results-fit-region", setup: async (s) => {
    await example(s);
    const card = s.page.locator(".pane-results .region-card");
    await card.getByRole("button", { name: "Plot the region" }).click();
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? []).length >= 3,
      null, { timeout: 180000 });
    await selectSheet(s, "Nonlin fit of Dose response");
    await s.page.locator(".pane-results .region-card .hint-block").first().waitFor({ timeout: 120000 });
    await into(s, ".pane-results .region-card", "start");
    await settle(s, 600);
  } },
  { name: "graphs-fit-region", setup: async (s) => {
    await example(s);
    const card = s.page.locator(".pane-results .region-card");
    await card.getByRole("button", { name: "Plot the region" }).click();
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? []).length >= 3,
      null, { timeout: 180000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
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
  // P-68: leave a value out of one analysis (the dialog, filled in), and
  // the Exclusions block of the sensitivity results with them put back
  { name: "results-leave-out-dialog", setup: async (s) => {
    await fixture(s, "why-history.json", { live: true });
    const block = s.page.getByRole("region", { name: "Exclusions" });
    await into(s, ".exclusions-card", "center");
    await click(s, block.getByRole("button", { name: "Leave out of this analysis…" }));
    const d = dialog(s, "Leave a value out of this analysis");
    await d.getByLabel("Data set").selectOption({ label: "Treated" });
    await d.getByLabel("Row", { exact: true }).fill("2");
    await d.getByLabel("Reason").fill("pipetting error noted");
    await settle(s, 400);
  } },
  { name: "results-left-out", setup: async (s) => {
    await fixture(s, "why-history.json", { live: true });
    const block = s.page.getByRole("region", { name: "Exclusions" });
    await into(s, ".exclusions-card", "center");
    await click(s, block.getByRole("button", { name: "Leave out of this analysis…" }));
    const d = dialog(s, "Leave a value out of this analysis");
    await d.getByLabel("Data set").selectOption({ label: "Treated" });
    await d.getByLabel("Row", { exact: true }).fill("2");
    await d.getByLabel("Reason").fill("pipetting error noted");
    await d.getByRole("button", { name: "Leave out", exact: true }).click();
    await block.locator(".exc-all").waitFor({ timeout: 60000 });
    await into(s, ".exclusions-card", "start");
    await settle(s, 800);
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
  // dat.bcg (P-92): 13 trials' log risk ratios with SEs combined; the
  // results sheet (headline, typeset tables, checks) and the forest plot
  { name: "results-meta-analysis", setup: async (s) => {
    await fixture(s, "meta-bcg.json", { live: true });
    await s.page.locator(".pane-results .meta-results").first().waitFor({ timeout: 120000 });
    await into(s, ".pane-results .meta-results");
  } },
  { name: "graphs-forest-meta", setup: async (s) => {
    await fixture(s, "meta-bcg.json", { live: true });
    await selectSheet(s, "Forest plot of BCG trials");
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .some((t) => t.name === "Random effects"), null, { timeout: 180000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1000);
  } },
  // DABEST's seeded data (P-93): three repeats combined by the mini-meta,
  // and a 2 x 2 delta-delta, each as the rightmost column of the plot
  { name: "graphs-estimation-minimeta", setup: async (s) => {
    await fixture(s, "estimation-minimeta.json", { live: true });
    await selectSheet(s, "Estimation plot of Three repeats");
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .some((t) => t.name === "combined-effect"), null, { timeout: 180000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1000);
  } },
  { name: "results-estimation-minimeta", setup: async (s) => {
    await fixture(s, "estimation-minimeta.json", { live: true });
    await s.page.locator(".pane-results .estimation-results .derived").first().waitFor({ timeout: 180000 });
    await into(s, ".pane-results .estimation-results");
  } },
  { name: "graphs-estimation-delta-delta", setup: async (s) => {
    await fixture(s, "estimation-minimeta.json", { live: true });
    await selectSheet(s, "Estimation plot of Genotype by drug");
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .some((t) => t.name === "combined-effect"), null, { timeout: 180000 });
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
  // P-46: overdispersed counts, the Checks chip with its one-click switch
  { name: "results-quasi-poisson", setup: async (s) => {
    await fixture(s, "derived-numbers.json", { live: true });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Counts are overdispersed/ }));
    await s.page.getByRole("region", { name: /Counts are overdispersed/ }).waitFor();
    await into(s, ".pane-answer details.checks", "center");
    await settle(s, 800);
  } },
  // P-48: a partial correlation matrix controlling for Age
  { name: "results-partial-corr", setup: async (s) => {
    await fixture(s, "derived-numbers.json", { live: true });
    await selectSheet(s, "Partial correlation of Four variables");
    await s.page.getByText(/Partial correlation matrix \(Pearson r, controlling for Age\)/).first()
      .waitFor({ timeout: 240000 });
    await into(s, ".pane-results .mv-results", "start");
    await settle(s, 800);
  } },
  // P-48: X vs. two Y data sets compared (the same rows: Steiger's Z)
  { name: "results-corr-compare", setup: async (s) => {
    await fixture(s, "derived-numbers.json", { live: true });
    await selectSheet(s, "Correlation of Same subjects");
    const card = s.page.locator(".pane-results .compare-corr").first();
    await card.waitFor({ timeout: 240000 });
    await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 800);
  } },
  // P-28: survival at 365 days with the difference row, its CI and P
  { name: "results-survival-difference", setup: async (s) => {
    await fixture(s, "derived-numbers.json", { live: true });
    await selectSheet(s, "Survival of Lung cancer by sex");
    const block = s.page.locator('section[aria-label="Survival at a chosen time"]').first();
    await block.waitFor({ timeout: 240000 });
    await block.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-57: the 0% and 100% a Normalize used, per data set
  { name: "results-normalize-references", setup: async (s) => {
    await fixture(s, "derived-numbers.json", { live: true });
    await selectSheet(s, "Normalize of Viability");
    const refs = s.page.getByRole("region", { name: "References used" }).first();
    await refs.waitFor({ timeout: 240000 });
    await refs.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 800);
  } },
  // P-98: a blank mean with its SD and n taken from samples: the
  // propagated SD and SEM per row
  { name: "results-propagation", setup: async (s) => {
    await fixture(s, "derived-numbers.json", { live: true });
    await selectSheet(s, "Blank-corrected Absorbance with errors");
    const block = s.page.getByRole("region", { name: "Propagated uncertainty" }).first();
    await block.waitFor({ timeout: 240000 });
    await block.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 800);
  } },
  // P-98: the Checks row's note that propagated SDs are not replicates,
  // and the uncertainty settings
  { name: "results-propagation-note", setup: async (s) => {
    await fixture(s, "derived-numbers.json", { live: true });
    await selectSheet(s, "Blank-corrected Absorbance with errors");
    await s.page.getByRole("region", { name: "Propagated uncertainty" }).first().waitFor({ timeout: 240000 });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await into(s, ".pane-answer details.checks", "center");
    await settle(s, 800);
  } },
  // P-82: the adjusted difference as the answer, the equal-slopes check open
  { name: "results-ancova", setup: async (s) => {
    await fixture(s, "glm-models.json", { live: true });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Equal slopes/ }));
    await into(s, ".pane-answer", "start");
    await settle(s, 800);
  } },
  // P-86: overdispersed dishes, the dispersion chip with its one-click switch
  { name: "results-binomial", setup: async (s) => {
    await fixture(s, "glm-models.json", { live: true });
    await selectSheet(s, "Binomial regression of Dishes");
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Proportions are overdispersed/ }));
    await into(s, ".pane-answer details.checks", "center");
    await settle(s, 800);
  } },
  // P-86: the negative binomial results table (θ and the test against Poisson)
  { name: "results-negbin", setup: async (s) => {
    await fixture(s, "glm-models.json", { live: true });
    await selectSheet(s, "Negative binomial regression of Ames TA98");
    await s.page.getByText("Negative binomial vs Poisson").first().waitFor({ timeout: 240000 });
    await into(s, ".pane-results .mv-results", "start");
    await settle(s, 800);
  } },
  // P-90: competing risks: Gray's test as the answer, the names of the
  // kinds of event and the Gray's test table
  { name: "results-competing", setup: async (s) => {
    await fixture(s, "survival-models.json", { live: true });
    await selectSheet(s, "Competing risks of Trial by drug");
    const block = s.page.locator('section[aria-label="Gray\'s test"]').first();
    await block.waitFor({ timeout: 240000 });
    await into(s, ".pane-answer", "start");
    await settle(s, 800);
  } },
  { name: "results-competing-at-time", setup: async (s) => {
    await fixture(s, "survival-models.json", { live: true });
    await selectSheet(s, "Competing risks of Trial by drug");
    const block = s.page.locator('section[aria-label="Cumulative incidence at a chosen time"]').first();
    await block.waitFor({ timeout: 240000 });
    await block.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-90: the cumulative incidence graph of one kind of event, CI band
  { name: "graphs-competing", setup: async (s) => {
    await fixture(s, "survival-models.json", { live: true });
    await selectSheet(s, "Cumulative incidence of Trial by drug");
    await s.page.locator(".plot-card .js-plotly-plot").first().waitFor({ timeout: 240000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  // P-91: a Weibull AFT model: the time ratio as the answer, then the
  // percentile times with an Extrapolated badge open
  { name: "results-parametric", setup: async (s) => {
    await fixture(s, "survival-models.json", { live: true });
    await selectSheet(s, "Parametric survival of Ovarian by treatment");
    await s.page.locator('section[aria-label="Time ratios"]').first().waitFor({ timeout: 240000 });
    await into(s, ".pane-answer", "start");
    await settle(s, 800);
  } },
  { name: "results-parametric-percentiles", setup: async (s) => {
    await fixture(s, "survival-models.json", { live: true });
    await selectSheet(s, "Parametric survival of Ovarian by treatment");
    const block = s.page.locator('section[aria-label="Percentile survival times"]').first();
    await block.waitFor({ timeout: 240000 });
    await click(s, block.getByRole("button", { name: "Extrapolated" }).first());
    await block.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-88: ordinal regression of histology scores: the odds ratio of a
  // higher score as the answer, the proportional-odds check open
  { name: "results-ordinal", setup: async (s) => {
    await fixture(s, "glm-models.json", { live: true });
    await selectSheet(s, "Ordinal regression of Histology");
    await s.page.getByText("Ordinal regression (proportional odds) of Score").first().waitFor({ timeout: 240000 });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Proportional odds not rejected/ }));
    await into(s, ".pane-answer", "start");
    await settle(s, 800);
  } },
  // P-88: the results table: thresholds, each term, the proportional-odds check
  { name: "results-ordinal-table", setup: async (s) => {
    await fixture(s, "glm-models.json", { live: true });
    await selectSheet(s, "Ordinal regression of Histology");
    const cuts = s.page.getByText("Cut points (thresholds)").first();
    await cuts.waitFor({ timeout: 240000 });
    await cuts.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-89: the separation refusal offers Firth's correction
  { name: "results-firth-offer", setup: async (s) => {
    await fixture(s, "glm-models.json", { live: true });
    await selectSheet(s, "Logistic regression of Dose study");
    await s.page.getByRole("button", { name: "Fit with Firth's correction" }).waitFor({ timeout: 240000 });
    await settle(s, 800);
  } },
  // P-89: Firth's fit from the separation message: its odds ratio as the
  // answer, the shrinkage note open
  { name: "results-firth", setup: async (s) => {
    await fixture(s, "glm-models.json", { live: true });
    await selectSheet(s, "Logistic regression of Dose study");
    // at phone width the navigator drawer stays open over the pane: close it
    if (s.page.viewportSize().width < 600) {
      await s.page.keyboard.press("Escape");
      await s.page.waitForTimeout(500);
    }
    await click(s, s.page.getByRole("button", { name: "Fit with Firth's correction" }));
    await s.page.getByText("Firth logistic regression of Response").first().waitFor({ timeout: 240000 });
    const checks = s.page.locator(".pane-answer details.checks").first();
    await click(s, checks.locator("summary"));
    await click(s, s.page.getByRole("button", { name: /Firth's correction: estimates shrunk/ }));
    await into(s, ".pane-answer", "start");
  } },
  // P-87: sleepstudy with a random slope of Days (Satterthwaite df)
  { name: "results-lmm-slope", setup: async (s) => {
    await fixture(s, "lmm.json", { live: true });
    const card = s.page.locator(".pane-results .lmm-results").first();
    await card.waitFor({ timeout: 240000 });
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-87: slices nested in animals with a covariate: random effects
  { name: "results-lmm-nested", setup: async (s) => {
    await fixture(s, "lmm.json", { live: true });
    await selectSheet(s, "Mixed model of Patch clamp");
    const block = s.page.locator(".lmm-results section[aria-label='Random effects']").first();
    await block.waitFor({ timeout: 240000 });
    await block.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-87: the controls with a nested level, covariates and a random slope
  { name: "controls-lmm", setup: async (s) => {
    await fixture(s, "lmm.json", { live: true });
    const controls = s.page.locator(".pane-controls").first();
    const cov = await reveal(s, controls.getByRole("heading", { name: "Covariates" }));
    await cov.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-83: the Interaction block of a two-way RM ANOVA (2 x 2, drug within)
  { name: "results-rm-interaction", setup: async (s) => {
    await fixture(s, "contrasts.json", { live: true });
    const block = s.page.locator(".pane-results .interaction-block").first();
    await block.locator(".interaction-dod").waitFor({ timeout: 240000 });
    await block.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-83: planned and post hoc (Scheffé) custom contrasts after one-way ANOVA
  { name: "results-custom-contrasts", setup: async (s) => {
    await fixture(s, "contrasts.json", { live: true });
    await selectSheet(s, "One-way ANOVA of Three groups");
    const card = s.page.locator(".pane-results .custom-contrasts-results").first();
    await card.waitFor({ timeout: 240000 });
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-83: the "Custom contrast…" dialog with a sum that is not 0
  { name: "dialog-custom-contrast", setup: async (s) => {
    await fixture(s, "contrasts.json", { live: true });
    await selectSheet(s, "One-way ANOVA of Three groups");
    const controls = s.page.locator(".pane-controls").first();
    await click(s, await reveal(s, controls.getByRole("button", { name: "Custom contrast…" })));
    const d = dialog(s, "Custom contrast");
    await d.getByLabel("Coefficient: Vehicle").fill("-1");
    await d.getByLabel("Coefficient: Drug A").fill("2");
    await click(s, d.getByRole("button", { name: "Add contrast" }));
    await d.locator(".contrast-status[data-problem]").waitFor();
    await settle(s, 500);
  } },
  // P-84: a log-scale ANOVA from mean, SD, N, its approximation stated
  { name: "results-summary-log", setup: async (s) => {
    await fixture(s, "summary-parity.json", { live: true });
    await selectSheet(s, "Log-scale ANOVA of Titres");
    const note = s.page.locator(".pane-results .log-note [data-approximate]").first();
    await note.waitFor({ timeout: 240000 });
    await s.page.locator(".pane-results .geometric-means").first()
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-84: planned pairs in the comparisons picker of a mean, SD, N table
  { name: "controls-summary-family", setup: async (s) => {
    await fixture(s, "summary-parity.json", { live: true });
    const controls = s.page.locator(".pane-controls").first();
    const fam = await reveal(s, controls.getByLabel("Comparisons", { exact: true }));
    await fam.selectOption("pairs");
    await controls.getByRole("checkbox", { name: "Control vs. High" }).check();
    await controls.locator(".planned-pairs").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 800);
  } },
  // P-84: the mixed model's comparisons picker (Holm, each vs. Baseline)
  { name: "controls-mixed-family", setup: async (s) => {
    await fixture(s, "summary-parity.json", { live: true });
    await selectSheet(s, "Mixed model of Weekly scores");
    const controls = s.page.locator(".pane-controls").first();
    const pick = await reveal(s, controls.locator(".rm-posthoc .comparisons-picker"));
    await pick.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 800);
  } },
  // P-85: the aligned rank transform of Higgins 1990 Table 5, ART-C of Moisture
  { name: "results-art", setup: async (s) => {
    await fixture(s, "art-anova.json", { live: true });
    const card = s.page.locator(".pane-results .art-results").first();
    await card.waitFor({ timeout: 240000 });
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-85: the two-way controls with the aligned rank transform chosen
  { name: "controls-art", setup: async (s) => {
    await fixture(s, "art-anova.json", { live: true });
    const controls = s.page.locator(".pane-controls").first();
    const sel = await reveal(s, controls.getByLabel("ART-C contrasts"));
    await sel.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settle(s, 800);
  } },
  // P-94: the standard curve's Precision report (4 plates on 2 days)
  { name: "results-precision-report", setup: async (s) => {
    await fixture(s, "precision.json", { live: true });
    const rep = s.page.locator(".pane-results .precision-report").first();
    await rep.waitFor({ timeout: 240000 });
    await rep.locator(".precision-detail summary").nth(1).click();
    await rep.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-94: CLSI EP05 data as a nested table under the precision study
  { name: "results-nested-precision", setup: async (s) => {
    await fixture(s, "precision.json", { live: true });
    await selectSheet(s, "Precision of EP05 20 x 2 x 2");
    const rep = s.page.locator(".pane-results .precision-results").first();
    await rep.locator("tbody tr").first().waitFor({ timeout: 240000 });
    await rep.locator(".precision-detail summary").first().click();
    await rep.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await settle(s, 800);
  } },
  // P-94: the standard-curve wizard's Precision step with its preview
  { name: "assay-wizard-precision", setup: async (s) => {
    await fixture(s, "precision.json", { live: true });
    await click(s, await reveal(s, s.page.getByRole("button", { name: "Open setup wizard…" })));
    const wiz = s.page.locator("dialog.assay-wizard");
    await wiz.waitFor();
    await click(s, wiz.getByRole("button", { name: /Precision/ }));
    await wiz.locator(".precision-report").waitFor({ timeout: 240000 });
    await settle(s, 800);
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
  { name: "results-whole-script", setup: async (s) => {
    // P-67: the report card's code with "Copy whole script" beside the
    // snippet's copy button (the t test of the statistics-table project)
    await fixture(s, "stats-table.json", { live: true });
    await selectSheet(s, "t test of Weights");
    const sum = s.page.locator(".report-card .snippets summary");
    await sum.waitFor({ timeout: 240000 });
    await sum.click();
    const btn = s.page.locator(".report-card .snippets").getByRole("button", { name: "Copy whole script" });
    await btn.waitFor({ timeout: 30000 });
    await btn.evaluate((el) => el.scrollIntoView({ block: "center" }));
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
  // the vehicle left of an X axis break, each Top held at its own wells (P-104)
  { name: "graphs-zero-break", setup: async (s) => {
    await fixture(s, "zero-break.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
      .filter((t) => t.xaxis === "x3").length === 2, null, { timeout: 120000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  { name: "graphs-format-axes-zero", setup: async (s) => {
    await fixture(s, "zero-break.json", { live: true });
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    // a formatted graph's button reads "Settings Formatted"
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: /^Settings/ }));
    await click(s, dialog(s, "Graph settings").getByRole("button", { name: "Format axes…" }));
    const d = s.page.locator("dialog.fmt-dialog");
    await click(s, d.getByRole("tab", { name: "X axis" }));
    await d.getByRole("checkbox", { name: "Draw the zero dose left of a break" })
      .evaluate((e) => e.scrollIntoView({ block: "center" }));
    await settle(s, 500);
  } },
  { name: "results-zero-dose-hold", setup: async (s) => {
    await fixture(s, "zero-break.json", { live: true });
    await click(s, s.page.getByRole("treeitem", { name: "Nonlin fit of Vehicle wells, not held", exact: true })
      .first().locator(":scope > .nav-row"));
    const note = s.page.getByRole("note", { name: "Zero dose left out" });
    await note.getByRole("button", { name: "Hold each curve's Top at its own zero-dose wells" })
      .waitFor({ timeout: 120000 });
    await into(s, ".pane-results .zero-dose", "center");
  } },
  // a star at each day from the two-way ANOVA's Sidak comparisons (P-105)
  { name: "graphs-time-stars", setup: async (s) => {
    await fixture(s, "time-stars.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
      .filter((a) => a.name === "time-star").length === 4, null, { timeout: 120000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  { name: "graphs-comparisons-time", setup: async (s) => {
    await fixture(s, "time-stars.json", { live: true });
    await s.page.locator(".js-plotly-plot").first().waitFor();
    await into(s, ".plot-card", "center");
    await click(s, s.page.locator(".plot-card").getByRole("button", { name: /^Settings/ }));
    await click(s, dialog(s, "Graph settings").getByRole("button", { name: "Pairwise comparisons…" }));
    await s.page.locator("dialog.fmt-dialog").getByRole("checkbox", { name: "Show stars at each time point" })
      .waitFor();
    await settle(s, 500);
  } },
  // pairwise log-rank brackets beside Kaplan-Meier curves (P-111)
  { name: "graphs-km-brackets", setup: async (s) => {
    await fixture(s, "km-brackets.json", { live: true });
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
      .filter((a) => a.name === "bracket-label").length === 3, null, { timeout: 120000 });
    await into(s, ".plot-card", "center");
    await settle(s, 1200);
  } },
  // brackets between the two panels of the three-way graph (P-111)
  { name: "graphs-panel-brackets", setup: async (s) => {
    await fixture(s, "km-brackets.json", { live: true });
    await selectSheet(s, "Three-way graph");
    await s.page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
      .some((a) => a.name === "bracket-label" && a.xref === "paper"), null, { timeout: 120000 });
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
  { name: "graphs-layout-source", setup: async (s) => {
    // P-65: the layout's export group with Source data (.xlsx)
    await fixture(s, "source-data.json");
    await s.page.waitForFunction(() => document.querySelectorAll(".layout-graph .plot.js-plotly-plot").length === 2,
      null, { timeout: 120000 });
    await settle(s, 1500);
  } },

  // ---- guided flows
  { name: "guided-which-test", setup: async (s) => {
    await example(s);
    await analyzeItem(s, /^Help me choose/);
    await dialog(s, "Help me choose a test").waitFor();
  } },
  // P-82: Help me choose with a baseline: ANCOVA, the RM route explained
  { name: "guided-which-test-baseline", setup: async (s) => {
    await example(s);
    await analyzeItem(s, /^Help me choose/);
    const dlg = dialog(s, "Help me choose a test");
    await dlg.waitFor();
    await dlg.locator("fieldset", { hasText: "What did you measure?" }).getByLabel(/^A measurement/).check();
    await dlg.locator("fieldset", { hasText: "How many groups or conditions?" }).getByLabel("Two", { exact: true }).check();
    await dlg.locator("fieldset", { hasText: "measured in each subject before treatment" })
      .getByLabel("Yes", { exact: true }).check();
    await dlg.locator(".wt-test", { hasText: "ANCOVA" }).waitFor();
    await settle(s, 500);
  } },
  { name: "guided-plan", setup: async (s) => {
    await example(s);
    await analyzeItem(s, /^Plan an experiment/);
    await dialog(s, "Plan an experiment").waitFor();
  } },
  // P-97: a dose series that misses the top plateau (flagged), with a
  // finished simulation check.
  { name: "guided-plan-dose", setup: async (s) => {
    await example(s);
    await analyzeItem(s, /^Plan an experiment/);
    const pd = dialog(s, "Plan an experiment");
    await pd.waitFor();
    await pd.getByRole("group", { name: "What did you measure?" })
      .getByRole("radio", { name: "A dose-response or other curve" }).check();
    await pd.getByLabel("Highest concentration").fill("1778");
    await s.page.waitForFunction(() => /28\.2-fold/.test(
      document.querySelector(".plan-exp .dose-plan-answer")?.textContent ?? ""), null, { timeout: 60000 });
    await pd.getByLabel("Simulated experiments").fill("10");
    await pd.locator(".dose-plan-sim").getByLabel("Seed", { exact: true }).fill("3");
    await pd.getByRole("button", { name: "Simulate the series" }).click();
    await pd.locator(".dose-plan-sim .power-kv").waitFor({ timeout: 180000 });
    await pd.locator(".dose-plan").scrollIntoViewIfNeeded();
    await settle(s);
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
  // P-16: an assay's Notes strip counts the wells used and names the ones
  // left out (an Undetermined, a blank and an excluded Cq, a row without
  // a target, an NTC)
  { name: "guided-assay-analysed", setup: async (s) => {
    await fixture(s, "assay-analysed.json", { live: true });
    await s.page.locator(".notes-strip .analysed-line").first().waitFor({ timeout: 120000 });
    await settle(s, 1000);
    await into(s, ".pane-results .notes-strip", "center");
  } },
  // P-31 follow-up: the flow summary's linked graph, its legend naming the
  // statistic with the full gate path
  { name: "guided-flow-legend", setup: async (s) => {
    await example(s);
    const dlg = await newTableDialog(s);
    await dlg.getByRole("radio", { name: "Start from an assay" }).check();
    await dlg.getByRole("radio", { name: /^Flow cytometry/ }).check();
    await dlg.getByRole("button", { name: "Start assay" }).click();
    const wiz = s.page.locator("dialog.assay-wizard");
    await wiz.waitFor({ timeout: 30000 });
    for (let i = 0; i < 8; i++) {
      const next = wiz.getByRole("button", { name: "Next", exact: true });
      if (!(await next.count()) || await next.isDisabled()) break;
      await next.click();
      await s.page.waitForTimeout(300);
    }
    await wiz.locator(".modal-actions .wizard-next").click();
    await wiz.waitFor({ state: "detached", timeout: 30000 });
    await s.page.locator(".flow-results").getByRole("button", { name: /^Open “Per donor of/ }).click({ timeout: 120000 });
    await selectSheet(s, /^Graph of Per donor of/);
    const legend = s.page.locator(".figure-legend");
    await legend.waitFor({ timeout: 120000 });
    if (!(await legend.evaluate((e) => e.open))) await click(s, legend.locator("summary"));
    await s.page.locator(".figure-legend-text").filter({ hasText: "FlowJo gate statistic" })
      .waitFor({ timeout: 120000 });
    await settle(s, 1000);
    await into(s, ".figure-legend", "center");
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
  // P-95: a design added to the power tool (repeated measures ANOVA, the
  // Berti example of Faul et al. 2007), with its method and source line.
  { name: "guided-power-designs", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "Power and sample size…");
    const pw = s.page.locator("dialog.power-dialog");
    await pw.waitFor();
    await pw.getByLabel("Test", { exact: true }).selectOption("anova_rm");
    await pw.getByLabel("Power (1 − β)").fill("0.95");
    await pw.getByLabel("Groups", { exact: true }).fill("2");
    await pw.getByLabel("Measurements per subject").fill("10");
    await pw.getByLabel("Cohen's f").fill("0.25");
    await s.page.waitForFunction(() => /Total N\s+20/.test(
      document.querySelector("dialog.power-dialog .power-summary")?.innerText ?? ""), null, { timeout: 60000 });
    await pw.locator(".power-curve .plot").nth(1).waitFor({ timeout: 60000 }).catch(() => {});
    await settle(s);
  } },
  // P-96: the nested design (ICC 0.3, 10 cells per animal) with its
  // trade-off table and a finished simulation check.
  { name: "guided-power-nested", setup: async (s) => {
    await example(s);
    await headerMenu(s, "File", "Power and sample size…");
    const pw = s.page.locator("dialog.power-dialog");
    await pw.waitFor();
    await pw.getByLabel("Test", { exact: true }).selectOption("nested");
    await pw.locator(".power-tradeoff").waitFor({ timeout: 60000 });
    await pw.getByLabel("Simulated experiments").fill("500");
    await pw.locator(".power-nested-sim").getByLabel("Seed", { exact: true }).fill("7");
    await pw.getByRole("button", { name: "Simulate power" }).click();
    await pw.locator(".power-nested-sim .power-kv").waitFor({ timeout: 120000 });
    await pw.locator(".power-nested-sim").scrollIntoViewIfNeeded();
    await settle(s);
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
        // an analysis rerun by the switch (a large table) finishes before the
        // shot, unless the busy line is what the scene shows (busy: true)
        if (!sc.busy) await page.waitForFunction(() => !document.querySelector(".analysis-busy:not(.cancelled)"), null,
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
