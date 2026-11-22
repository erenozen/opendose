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
//        node scripts/ui-stage.mjs http://localhost:5201/ /tmp/shots "grid-*,first-start"
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
/** The start screen of a first visit (no autosave, no project). */
async function start(s) {
  await open(s);
  await s.page.locator(".start-screen").waitFor({ timeout: 60000 });
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

/** Makes `loc` visible: at phone width the header's secondary actions sit
 *  behind "More actions" and the navigator in a drawer. */
async function reveal(s, loc) {
  const first = loc.first();
  if (await first.isVisible().catch(() => false)) return first;
  const more = s.page.getByRole("button", { name: "More actions" });
  if (await more.isVisible().catch(() => false) && await more.getAttribute("aria-expanded") !== "true") {
    await more.click();
    await s.page.waitForTimeout(300);
    if (await first.isVisible().catch(() => false)) return first;
    await more.click();
  }
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
async function saveMenu(s, item) {
  await click(s, button(s, "More ways to save and share"));
  if (item) await s.page.getByRole("menuitem", { name: item, exact: true }).click();
}
const dialog = (s, name) => s.page.getByRole("dialog", { name });
/** Brings an element into view inside whatever scrolls it. */
const into = (s, selector, block = "start") => s.page.evaluate(([sel, b]) => {
  document.querySelector(sel)?.scrollIntoView({ block: b, inline: "nearest" });
  // keep the top of the element clear of the sticky header
  if (b === "start") window.scrollBy(0, -((document.querySelector("header")?.offsetHeight ?? 0) + 8));
}, [selector, block]);
async function pasteInto(s, cellLabel, text) {
  await s.page.evaluate(([l, t]) => {
    const el = document.querySelector(`.data-table input[aria-label='${l}']`);
    if (!el) throw new Error(`no cell ${l}`);
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [cellLabel, text]);
}
async function newTableDialog(s) {
  await click(s, button(s, "New data table"));
  const dlg = s.page.locator("dialog.new-table-dialog");
  await dlg.waitFor({ timeout: 10000 });
  return dlg;
}

// ------------------------------------------------------------ scenes
// Each scene: setup(s) builds the state; `full` shoots the full page
// instead of the viewport. Names start with the surface they belong to.

const scenes = [
  // ---- first run
  { name: "first-start", full: true, setup: start },
  { name: "first-start-paste", setup: async (s) => {
    await start(s);
    await s.page.locator(".start-paste textarea").fill(
      "Dose (µM)\tVehicle\tβ-12\n0.1\t98.2\t97.1\n1\t96.0\t88.4\n10\t95.1\t51.3\n100\t94.8\t12.9");
    await s.page.locator(".start-suggest").waitFor({ timeout: 10000 });
    await into(s, ".start-suggest", "center");
  } },
  { name: "first-engine-booting", setup: async (s) => {
    await holdEngine(s);
    await start(s);
    await click(s, s.page.getByRole("button", { name: /^New empty XY/ }));
    await s.page.locator(".welcome .engine-slot").waitFor({ timeout: 60000 });
    await s.page.waitForFunction(() => /[1-9]/.test(
      document.querySelector(".welcome .engine-slot-bytes")?.textContent?.split(" of ")[0] ?? ""), null,
    { timeout: 60000 });
    await into(s, ".welcome", "center");
  } },
  { name: "first-engine-booting-example", setup: async (s) => {
    await holdEngine(s);
    await example(s, { live: false });
    await s.page.locator(".engine-boot-note").waitFor({ timeout: 60000 });
  } },
  { name: "first-engine-failed", setup: async (s) => {
    await failEngine(s);
    await start(s);
    await click(s, s.page.getByRole("button", { name: /^New empty XY/ }));
    await button(s, "Try again").waitFor({ timeout: 120000 });
    await into(s, ".welcome-error", "center");
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
    await click(s, button(s, "Preferences"));
    await dialog(s, "Preferences").waitFor();
  } },
  { name: "shell-about", setup: async (s) => {
    await example(s);
    await click(s, button(s, "About OpenDose: privacy, non-affiliation and how to cite"));
    await s.page.locator(".info-pop").first().waitFor();
  } },
  { name: "shell-help", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Help: explainers, tour and keyboard shortcuts"));
    await button(s, "Take the tour").waitFor();
  } },
  { name: "shell-tools-menu", setup: async (s) => {
    await example(s);
    await click(s, s.page.getByRole("button", { name: /^Tools/ }));
    await s.page.getByRole("menuitem", { name: "Power and sample size…" }).waitFor();
  } },
  { name: "shell-save-menu", setup: async (s) => {
    await example(s);
    await saveMenu(s);
    await s.page.getByRole("menuitem", { name: "Copy share link…" }).waitFor();
  } },
  { name: "shell-share", setup: async (s) => {
    await example(s);
    await saveMenu(s, "Copy share link…");
    await s.page.locator("dialog[open]").first().waitFor();
    await settle(s, 1200);
  } },
  { name: "shell-export-pptx", setup: async (s) => {
    await example(s);
    await saveMenu(s, "Export graphs to PowerPoint (.pptx)…");
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
  { name: "shell-goto", setup: async (s) => {
    await fixture(s, "many-sheets.json");
    await s.page.locator(".nav-tree").first().waitFor({ state: "attached" });
    await s.page.keyboard.press("Control+k");
    const dlg = dialog(s, "Go to sheet");
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
    await click(s, button(s, "New project"));
    await s.page.getByRole("alertdialog", { name: "Start a new project?" }).waitFor();
  } },
  { name: "shell-nav-drawer", setup: async (s) => {
    await fixture(s, "many-sheets.json");
    if (s.phone) await click(s, button(s, "Show or hide the sheet navigator"));
    await s.page.locator(".navigator").waitFor();
  } },
  { name: "shell-more-actions", setup: async (s) => {
    await example(s);
    if (s.phone) await click(s, button(s, "More actions"));
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

  // ---- graphs
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
    await click(s, s.page.getByRole("button", { name: /Describe your experiment/ }));
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
  { name: "guided-tour", setup: async (s) => {
    await example(s);
    await click(s, button(s, "Help: explainers, tour and keyboard shortcuts"));
    await button(s, "Take the tour").click();
    await s.page.locator(".tour-card").waitFor();
    await s.page.locator(".tour-next").click();
    await s.page.locator(".tour-next").click();
    await s.page.locator('.tour[data-step="3"]').waitFor();
    await settle(s, 800);
  } },
  { name: "guided-power", setup: async (s) => {
    await example(s);
    await click(s, s.page.getByRole("button", { name: /^Tools/ }));
    await s.page.getByRole("menuitem", { name: "Power and sample size…" }).click();
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
