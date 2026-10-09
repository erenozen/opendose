// Site validation: drives the live OpenDose site through its real UI, as a
// user would, for the external reference corpus in docs/validation
// (public manifest + the local-only private one when present), compares
// every reference quantity with what the results sheet shows, records the
// usability frictions met on the way, and runs a short performance and
// robustness probe.
//
//   node scripts/validate-site.mjs https://erenozen.dev/opendose/
//   node scripts/validate-site.mjs <url> --only=nist-misra1a,r-sleep
//   node scripts/validate-site.mjs <url> --no-perf | --no-data | --dump
//   node scripts/validate-site.mjs <url> --digits=10   (results precision; default 6)
//   node scripts/validate-site.mjs <url> --out=/tmp/run10   (writes /tmp/run10.json and .md)
//
// Outputs: docs/validation/results-site.json, docs/validation/results-site.md
// and one 900 px wide PNG per dataset under docs/validation/site-screens/.
// Nothing here changes the app; every number is read from the page.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DRIVERS, EXPLAIN } from "./validate-site-drivers.mjs";
import { runPerf } from "./validate-site-perf.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "..", "..");
const VAL = join(REPO, "docs", "validation");
const SCREENS = join(VAL, "site-screens");
const args = process.argv.slice(2);
const baseUrl = args.find((a) => !a.startsWith("--")) ?? "https://erenozen.dev/opendose/";
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const skip = (args.find((a) => a.startsWith("--skip=")) ?? "").slice(7).split(",").filter(Boolean);
const doPerf = !args.includes("--no-perf") && !only.length;
const doData = !args.includes("--no-data");
const dump = args.includes("--dump");
// Results precision chosen in Preferences. The documented protocol (and the
// 2026-10-04 run) reads results at 6 significant digits; Preferences offer
// up to 10 since 0.4.0, and a run at 10 is useful as a separate check.
const digits = Number((args.find((a) => a.startsWith("--digits=")) ?? "--digits=6").slice(9));
if (!Number.isInteger(digits) || digits < 1) throw new Error(`--digits must be a whole number, got ${digits}`);
const outBase = (args.find((a) => a.startsWith("--out=")) ?? "").slice(6);
const partial = only.length > 0 || skip.length > 0 || !doPerf || !doData;
mkdirSync(SCREENS, { recursive: true });

// ---------------------------------------------------------------- corpus
const manifests = [join(VAL, "datasets", "manifest.json"),
  join(VAL, "private", "datasets", "manifest.json")].filter(existsSync);
const corpus = new Map();
for (const m of manifests) {
  const j = JSON.parse(readFileSync(m, "utf8"));
  const list = Array.isArray(j) ? j : j.datasets;
  const dir = dirname(m);
  for (const d of list) corpus.set(d.id, { ...d, dir, private: m.includes("private") });
}
const csvOf = (id) => readFileSync(join(corpus.get(id).dir, corpus.get(id).file), "utf8")
  .replace(/^﻿/, "").replace(/\r/g, "");

// -------------------------------------------------------------- comparing
/** The results precision the run reads at (set from Preferences below):
 *  the page strips trailing zeros, so a shown value is taken to carry at
 *  least this many significant digits. */
let resultDigits = digits;
const isPQuantity = (q) => q.split(/[.[\]]/).some((s) => /^p(_|$)/i.test(s) || /_p$/i.test(s))
  || /pairwise_t_pooled|p_adj/i.test(q);

/** First number in a shown string, with its significant digits. */
export function parseShown(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).replace(/−/g, "-").replace(/\s+/g, " ").trim();
  const floor = /^[<>≤≥]/.test(t) ? (t[0] === "<" || t[0] === "≤" ? "<" : ">") : null;
  const m = t.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
  if (!m) return null;
  const s = m[0];
  const mant = s.replace(/[eE].*$/, "").replace(/^[-+]/, "").replace(".", "").replace(/^0+/, "");
  return { value: Number(s), sig: Math.max(1, mant.length), floor, text: t };
}

function tolOf(ref) {
  const tol = ref.tolerance ?? {};
  if (typeof tol.abs === "number") return tol.abs;
  if (typeof tol.rel === "number") return Math.abs(tol.rel * ref.value);
  return 0;
}

/** Compare one reference with what the page showed. `got` is a string,
 *  or { s, abs, pct, sig, conv, note } (conv: a function applied to the
 *  parsed value, e.g. a re-parameterisation, recorded in the note). */
export function compare(ref, got, ds = null) {
  const gated = !ref.reference_status && !ref.approximate && !ref.model_dependent && !ds?.reference_status;
  const base = { quantity: ref.quantity, reference: ref.value, tolerance: ref.tolerance ?? null, gated };
  if (got === null || got === undefined || (typeof got === "object" && got.s == null && got.value == null)) {
    return { ...base, shown: null, status: "missing",
      note: (got && got.note) || "not shown on the page" };
  }
  const g = typeof got === "string" ? { s: got } : got;
  const p = g.value !== undefined ? { value: g.value, sig: g.sigShown ?? g.sig ?? 15, floor: null, text: String(g.value) } : parseShown(g.s);
  if (!p) return { ...base, shown: g.s, status: "missing", note: `could not read a number from "${g.s}"` };
  const minSig = g.sig ?? (isPQuantity(ref.quantity) ? 4 : resultDigits);
  const eff = Math.max(p.sig, minSig);
  let value = p.value;
  let half = value === 0 ? 0 : 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(value))) - (eff - 1));
  // a value computed from shown numbers carries their rounding: the driver
  // passes that half-width (propagated) instead of one from its digits
  if (g.value !== undefined && typeof g.half === "number") half = g.half;
  if (g.pct) { value /= 100; half /= 100; }
  if (g.conv) {
    const v2 = g.conv(value);
    // propagate the display half-unit through the conversion numerically
    const h2 = Math.abs(g.conv(value + half) - v2);
    value = v2; half = h2;
  }
  let refv = ref.value;
  if (g.abs) { value = Math.abs(value); refv = Math.abs(refv); }
  // Both numbers are rounded: they agree when their rounding intervals
  // overlap, i.e. within the manifest tolerance plus the page's half unit.
  const tol = (tolOf(ref) + half) * (1 + 1e-9) + 1e-300;
  let ok;
  if (p.floor === "<") ok = refv <= value + tol;
  else if (p.floor === ">") ok = refv >= value - tol;
  else ok = Math.abs(value - refv) <= tol;
  const status = ok ? "pass" : "fail";
  const rel = p.floor || !refv ? null : Math.abs(value - refv) / Math.abs(refv);
  const size = ok || rel === null ? undefined : rel <= 1e-4 ? "last digits (≤ 1e-4 relative)" : rel <= 0.01 ? "small (≤ 1%)" : "substantive (> 1%)";
  return { ...base, shown: g.s ?? String(g.value), value, used_tolerance: tol,
    diff: p.floor ? null : value - refv, rel_diff: rel, size, explained: !ok && g.explain ? g.explain : undefined,
    status: gated ? status : `info-${status}`,
    note: [g.note, p.floor ? `page shows only the bound ${p.text}` : "", g.abs ? "compared as absolute values" : ""]
      .filter(Boolean).join("; ") || undefined };
}

// --------------------------------------------------------------- browser
const browser = await chromium.launch({
  args: process.env.HOST_RESOLVER ? [`--host-resolver-rules=${process.env.HOST_RESOLVER}`] : [],
});
const origin = new URL(baseUrl).origin;
const appUrl = (params = {}) => {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

/** A fresh browser context at 1500 css px wide, rendered at 0.6 device
 *  pixels per css px so screenshots come out 900 px wide. */
async function newSession({ example = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 0.6,
    acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await ctx.addInitScript(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); })
        .observe({ type: "longtask", buffered: true });
    } catch { /* no long-task timing */ }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(150000); // the engine can hold the main thread for a long time
  const log = { errors: [] };
  page.on("pageerror", (e) => log.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") log.errors.push(`console: ${m.text().slice(0, 300)}`); });
  const t0 = Date.now();
  await page.goto(example ? appUrl({ example: "1" }) : appUrl(), { waitUntil: "domcontentloaded" });
  // First numbers on screen (builds that show saved or bundled results
  // before the engine is up), then the live engine's results; sites
  // without the data-live marker show results only when they are live.
  await page.waitForSelector(".results-table", { timeout: 240000 });
  const firstMs = Date.now() - t0;
  const marked = await page.locator(".pane-results[data-live]").count();
  if (marked) await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 240000 });
  return { ctx, page, log, loadMs: Date.now() - t0, firstMs };
}

const frictions = new Map();   // text -> { kind, text, datasets: Set }
function friction(kind, text, dsId, detail) {
  const f = frictions.get(text) ?? { kind, text, datasets: new Set() };
  if (dsId) f.datasets.add(detail ? `${dsId} (${detail})` : dsId);
  frictions.set(text, f);
}

/** Helpers handed to every driver. */
function helpers(page, log, dsId) {
  const timings = [];
  const u = {
    page, id: dsId, csv: () => csvOf(dsId), csvOf, ref: corpus.get(dsId), timings,
    friction: (kind, text, detail) => friction(kind, text, dsId, detail),
    sleep: (ms) => page.waitForTimeout(ms),

    async newProject() {
      // a driver that failed half-way can leave a dialog open over the page
      for (let i = 0; i < 3 && await page.locator("dialog[open], [role=dialog]:visible, [role=alertdialog]:visible").count(); i++) {
        await page.keyboard.press("Escape");
        await u.sleep(300);
      }
      await page.getByRole("button", { name: "New project" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "New project" }).click();
      await page.waitForSelector(".grid-toolbar");
      await page.evaluate(() => { window.__lt = []; });
    },

    /** New data table dialog; shape keys are the dialog's field labels. */
    async newTable(type, name, shape = {}) {
      await page.getByRole("button", { name: "New data table" }).first().click();
      const dlg = page.locator(".new-table-dialog");
      await dlg.locator(`input[name="table-type"][value="${type}"]`).check();
      await dlg.getByLabel("Table name").fill(name);
      if (shape.format) await dlg.getByLabel("Y values entered as").selectOption(shape.format);
      for (const [k, v] of Object.entries(shape)) {
        if (k !== "format") await dlg.getByLabel(k, { exact: true }).fill(String(v));
      }
      await dlg.getByRole("button", { name: "Create table" }).click();
      await page.waitForSelector(".grid-toolbar");
      await u.sleep(300);
    },

    /** Paste text into the grid at a cell with Ctrl+V. Comma-separated or
     *  long text opens the Import dialog, which is then completed. */
    async paste(text, { cell, titles = true, roles = {}, perDataset, replace = true, missing } = {}) {
      await page.evaluate((t) => navigator.clipboard.writeText(t), text);
      const target = cell ? page.locator(`.data-table input[aria-label="${cell}"]`)
        : page.locator(".data-table tbody input[data-r='0']:not([aria-label$='title'])").first();
      await target.click();
      await page.keyboard.press("Control+v");
      const imp = page.locator(".import-dialog");
      const opened = await imp.waitFor({ timeout: 4000 }).then(() => true, () => false);
      if (!opened) return "pasted into the grid";
      const titleBox = imp.getByLabel(/holds column titles/);
      if (titles && !(await titleBox.isChecked())) {
        u.friction("friction", "Import dialog: the first CSV line is text (column names) but \"First row holds column titles\" is not detected; every paste needs the box ticked by hand, otherwise the names become a data row.");
        await titleBox.check();
      }
      if (missing) {
        await imp.getByRole("tab", { name: "Filter" }).click();
        await imp.getByLabel("Missing-value code").fill(missing);
      }
      for (const [c, r] of Object.entries(roles)) await imp.getByLabel(`Column ${c} becomes`).selectOption(r);
      if (perDataset || replace) await imp.getByRole("tab", { name: "Placement" }).click();
      if (replace) await imp.getByLabel(/In place of the table/).check();
      if (perDataset) await imp.getByLabel("Y columns per dataset (replicates)").fill(String(perDataset));
      const summary = await imp.locator(".import-summary").innerText();
      u.mark();
      const t0 = Date.now();
      await imp.getByRole("button", { name: "Import", exact: true }).click();
      await imp.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
      await u.sleep(300);
      // the analysis that comes with the new table runs right after the
      // import, on the main thread: how long until the page answers again?
      await page.evaluate(() => 1);
      const frozen = Date.now() - t0;
      timings.push({ label: "import + automatic first analysis (page frozen until done)", ms: frozen, longTaskMs: 0, maxLongTaskMs: 0 });
      if (frozen > 5000) {
        const txt = (await page.locator(".pane-results").first().innerText().catch(() => "")).slice(0, 60).replace(/\s+/g, " ");
        u.friction("wrong", "Pasting into a new table freezes the page for more than 5 s while the table's automatic first analysis runs on the main thread (no progress indicator, no way to cancel). Worst case: an XY table starts with a 4PL log(inhibitor) fit, so non-dose-response XY data (a straight line, X = 60…70) is fitted from many starting values for over a minute and ends with \"did not converge\".",
          `${(frozen / 1000).toFixed(0)} s: "${txt}…"`);
      }
      return summary;
    },

    /** Import → Recipes (long / tidy table) → a new table of `output`. */
    async recipe(text, { roles = {}, output, name } = {}) {
      await page.getByRole("button", { name: "Import…", exact: true }).first().click();
      const imp = page.locator(".import-dialog");
      await imp.getByLabel("Pasted text").check();
      await imp.getByLabel("Text to import").fill(text);
      await imp.getByRole("tab", { name: "Recipes" }).click();
      const rd = page.locator(".recipe-dialog");
      await rd.waitFor();
      // Since 0.4.0 the Source step recognises instrument exports and picks
      // a recipe; a long table whose first column holds A/B (r-warpbreaks'
      // wool) is taken for a plate-reader grid. Choose the long-table
      // recipe by name, as a user would.
      const longRecipe = rd.getByRole("radio", { name: /^Long \(tidy\) table/ });
      if (await longRecipe.count()) {
        const guess = (await rd.getByText(/^Looks like: /).first().innerText().catch(() => "")).trim();
        if (guess && !/Long \(tidy\) table/.test(guess)) {
          u.friction("friction", "Import → Recipes: \"Recognise the file\" takes a long (tidy) table for an instrument export and picks that recipe; the long-table recipe has to be chosen by hand.", guess);
        }
        await longRecipe.check();
      }
      await rd.getByRole("tab", { name: "Columns" }).click();
      for (const [c, r] of Object.entries(roles)) await rd.getByLabel(`Column ${c} holds`).selectOption(r);
      await rd.getByRole("tab", { name: "Table" }).click();
      const outLabel = { column: /^Column \(/, grouped: /^Grouped \(/, xy: /^XY \(/, multivariable: /^Multiple variables \(/,
        survival: /^Survival \(/, nested: /^Nested \(/ }[output];
      await rd.getByRole("radio", { name: outLabel }).check();
      if (name) await rd.getByRole("textbox", { name: "Table name", exact: true }).fill(name);
      const counts = await rd.locator(".import-summary").innerText().catch(() => "");
      await rd.getByRole("button", { name: "Create table" }).click();
      await rd.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
      await u.sleep(500);
      return counts;
    },

    mark() { u._mark = Date.now(); },
    async analyze(re) {
      u.mark();
      await page.getByRole("button", { name: "Analyze", exact: true }).click();
      await page.getByRole("menuitem", { name: re }).first().click();
      await u.sleep(300);
    },

    /** The column-analysis select on the current results sheet. */
    async columnAnalysis(value) {
      u.mark();
      await page.locator(".analysis-select").first().selectOption(value);
      await u.sleep(200);
    },

    /** A <select> inside the controls whose label / section mentions `text`. */
    async select(text, value, { exact = false } = {}) {
      u.mark();
      const byLabel = page.locator(".controls").getByLabel(text, { exact });
      if (await byLabel.count()) {
        const tag = await byLabel.first().evaluate((e) => e.tagName);
        if (tag === "SELECT") { await byLabel.first().selectOption(value); return; }
      }
      const lab = page.locator(".controls label", { hasText: text }).locator("select");
      if (await lab.count()) { await lab.first().selectOption(value); return; }
      await page.locator(".controls section", { hasText: text }).locator("select").first().selectOption(value);
    },
    async check(text, on = true) {
      u.mark();
      const box = page.locator(".controls label", { hasText: text }).locator("input[type=checkbox]").first();
      if ((await box.isChecked()) !== on) await box.click();
    },
    async fillIn(text, value) {
      u.mark();
      const inp = page.locator(".controls").getByLabel(text, { exact: true });
      await inp.first().fill(String(value));
    },

    /** Pick a model from the nonlinear model picker. */
    async model(search, optionRe) {
      u.mark();
      await page.getByRole("button", { name: /^Model:/ }).click();
      await page.getByRole("combobox", { name: "Search models" }).fill(search);
      await page.getByRole("option", { name: optionRe }).first().click();
      await u.sleep(300);
    },
    async constrain(param, value) {
      const row = page.locator(".constraint-row", { hasText: `${param} = constant` }).first();
      const box = row.locator("input[type=checkbox]");
      if (!(await box.isChecked())) await box.click();
      await row.getByLabel(`${param} constant value`).fill(String(value));
    },
    async xAlreadyLog(on) {
      const box = page.locator(".controls label", { hasText: "X values are already log10" }).locator("input");
      if (await box.count() && (await box.isChecked()) !== on) await box.click();
    },
    async advanced() {
      const d = page.locator("details.advanced").first();
      if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
    },
    async share(params) {
      await u.advanced();
      for (const p of params) {
        const box = page.locator(".shared-params label", { hasText: new RegExp(`^${p}$`) }).locator("input");
        if (!(await box.isChecked())) await box.click();
      }
    },

    /** User-defined equation with initial values (and optional constants). */
    async userEquation({ name, text, start = {}, xIsLog = false, constants = {} }) {
      await page.getByRole("button", { name: /^Model:/ }).click();
      await page.getByRole("combobox", { name: "Search models" }).fill("own equation");
      await page.getByRole("option", { name: /Enter your own equation/ }).click();
      const eq = page.getByRole("dialog", { name: "User-defined equation" });
      await eq.getByLabel("Name").fill(name);
      await eq.getByLabel("Equation", { exact: true }).fill(text);
      await eq.getByText(/Equation is valid|Line \d/).first().waitFor({ timeout: 30000 });
      const xl = eq.getByLabel(/X in this equation is log/);
      if ((await xl.isChecked()) !== xIsLog) await xl.click();
      for (const [p, v] of Object.entries(start)) {
        const inp = eq.getByLabel(`${p} initial value`, { exact: true });
        if (!(await inp.count())) { u.friction("friction", `Equation editor: no initial-value box for parameter ${p}`); continue; }
        await inp.fill(String(v));
      }
      for (const [p, v] of Object.entries(constants)) {
        await eq.getByLabel(`${p} default constraint`).selectOption("constant");
        await eq.getByLabel(`${p} constant value`).fill(String(v));
      }
      u.mark();
      await eq.getByRole("button", { name: "Use this equation" }).click();
      await eq.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    },

    /** Wait until the results pane stops changing; returns ms until the
     *  last change and the main-thread long tasks (engine work) seen. */
    async settle(label = "analysis", { min = 700, quiet = 1200, timeout = 180000, sel = ".pane-results" } = {}) {
      const t0 = u._mark ?? Date.now();
      u._mark = null;
      let last = await page.locator(sel).first().innerText().catch(() => "");
      // the engine runs on the main thread: the first read returns only
      // once it is done, so that moment counts as a change
      let lastChange = Date.now();
      while (Date.now() - t0 < timeout) {
        await page.waitForTimeout(150);
        const now = await page.locator(sel).first().innerText().catch(() => "");
        if (now !== last) { last = now; lastChange = Date.now(); }
        else if (Date.now() - lastChange >= quiet && Date.now() - t0 >= min) break;
      }
      const lt = await page.evaluate(() => { const a = window.__lt ?? []; window.__lt = []; return a; });
      const rec = { label, ms: lastChange - t0, longTaskMs: Math.round(lt.reduce((a, b) => a + b, 0)),
        maxLongTaskMs: Math.round(Math.max(0, ...lt)) };
      timings.push(rec);
      return rec;
    },

    /** Results as rendered: the text plus every table (heading, header and
     *  body rows as cell texts). Collapsed <details> are opened first. */
    async snap(sel = ".pane-results") {
      await page.evaluate((s) => document.querySelectorAll(`${s} details`).forEach((d) => { d.open = true; }), sel);
      await u.sleep(250);
      return page.evaluate((s) => {
        const root = document.querySelector(s) ?? document.body;
        const heads = [...root.querySelectorAll("h2,h3,h4,h5,caption,.dataset-name,summary")];
        const tables = [...root.querySelectorAll("table")].map((t) => {
          let heading = "";
          const hs = [];
          for (const h of heads) {
            if (h.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) hs.push(h.innerText.trim());
          }
          heading = hs.slice(-3).join(" / ");
          const head = t.tHead ? [...t.tHead.rows].map((r) => [...r.cells].map((c) => c.innerText.trim())) : [];
          const rows = [...t.tBodies].flatMap((b) => [...b.rows]).map((r) => [...r.cells].map((c) => c.innerText.trim()));
          return { heading, head, rows };
        });
        return { text: root.innerText, tables };
      }, sel);
    },
  };
  return u;
}

// ------------------------------------------------------- reading results
/** Row (array of cell texts) whose first cell matches `label`, optionally
 *  only in tables whose heading / header matches `inT`. */
export function row(snap, label, { inT, nth = 0 } = {}) {
  const re = label instanceof RegExp ? label : new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const hits = [];
  for (const t of snap.tables) {
    if (inT && !(inT.test(t.heading) || t.head.some((h) => inT.test(h.join(" "))))) continue;
    for (const r of t.rows) if (r.length && re.test(r[0])) hits.push(r);
  }
  return hits[nth] ?? null;
}
export const cell = (snap, label, col = 1, opts) => row(snap, label, opts)?.[col] ?? null;
/** Header-indexed cell: the column whose header matches `colRe`. */
export function hcell(snap, label, colRe, opts = {}) {
  const re = label instanceof RegExp ? label : new RegExp(`^${label}`, "i");
  for (const t of snap.tables) {
    if (opts.inT && !(opts.inT.test(t.heading) || t.head.some((h) => opts.inT.test(h.join(" "))))) continue;
    const head = t.head.at(-1) ?? [];
    const ci = head.findIndex((h) => colRe.test(h));
    if (ci < 0) continue;
    const r = t.rows.find((x) => re.test(x[0]));
    if (r) return r[ci] ?? null;
  }
  return null;
}
export const rx = (s, re, g = 1) => (s == null ? null : (String(s).replace(/−/g, "-").match(re)?.[g] ?? null));
export const textAfter = (snap, re, g = 1) => rx(snap.text, re, g);

// ------------------------------------------------------------ the run
const results = [];
let perf = null;
let sessionInfo = {};

if (doData) {
  const ids = [...DRIVERS.keys()].filter((id) => (!only.length || only.includes(id)) && !skip.includes(id));
  let sess = await newSession();
  sessionInfo.firstLoadMs = sess.loadMs;
  // Preferences: results precision, --digits (default 6, the documented
  // protocol); the largest offered value when the site offers fewer.
  {
    const { page } = sess;
    await page.getByRole("button", { name: "Preferences" }).click();
    const sel = page.getByRole("dialog", { name: "Preferences" }).getByLabel("Significant digits in results");
    const offered = (await sel.locator("option").allInnerTexts()).map((t) => t.trim());
    sessionInfo.digitsOffered = offered;
    sessionInfo.digitsRequested = digits;
    const use = offered.includes(String(digits)) ? String(digits)
      : offered.filter((o) => Number(o) <= digits).at(-1) ?? offered.at(-1);
    await sel.selectOption(use);
    sessionInfo.digitsUsed = Number(use);
    resultDigits = Number(use);
    await page.keyboard.press("Escape");
    if (Number(use) !== digits) {
      friction("missing", `Preferences → "Significant digits in results" offers only ${offered.join(", ")}; ${digits} cannot be chosen, so the run read results at ${use} significant digits.`);
    }
  }
  let n = 0;
  for (const id of ids) {
    const ds = corpus.get(id);
    if (!ds) { console.log(`skip ${id}: not in the corpus here`); continue; }
    if (n > 0 && n % 12 === 0) {   // a fresh tab now and then keeps memory flat
      await sess.ctx.close();
      sess = await newSession();
      const { page } = sess;
      await page.getByRole("button", { name: "Preferences" }).click();
      await page.getByRole("dialog", { name: "Preferences" }).getByLabel("Significant digits in results")
        .selectOption(String(sessionInfo.digitsUsed));
      await page.keyboard.press("Escape");
    }
    n++;
    const { page, log } = sess;
    log.errors.length = 0;
    const u = helpers(page, log, id);
    const t0 = Date.now();
    let got = {};
    let error = null;
    const drv = DRIVERS.get(id);
    try {
      await u.newProject();
      got = (await drv(u, { row, cell, hcell, rx, textAfter, compare: (r, g) => compare(r, g, ds) })) ?? {};
    } catch (e) {
      error = String(e?.message ?? e).split("\n")[0].slice(0, 400);
      console.log(`  ERROR ${id}: ${error}`);
      if (dump) console.log(String(e?.stack ?? "").split("\n").filter((l) => /validate-site/.test(l)).slice(0, 4).join("\n"));
    }
    const shot = join(SCREENS, `${id}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    if (dump) {
      const snapText = await page.locator(".pane-results").first().innerText().catch(() => "");
      console.log(`----- ${id}\n${snapText.slice(0, 6000)}`);
    }
    const refs = ds.reference.map((r) => {
      const g = got[r.quantity];
      let gg = g === undefined ? null : g;
      const ex = EXPLAIN[id]?.find((e) => e.re.test(r.quantity));
      if (ex && gg != null) {
        const o = typeof gg === "string" ? { s: gg } : { ...gg };
        if (ex.context) o.note = [o.note, ex.why].filter(Boolean).join("; "); else o.explain = ex.why;
        gg = o;
      }
      const c = compare(r, gg, ds);
      if (c.status === "missing" && got.__why) c.note = got.__why(r.quantity) ?? c.note;
      return c;
    });
    const count = (s) => refs.filter((r) => r.status === s).length;
    const rec = {
      id, title: ds.title, workflow: ds.workflow, table_type: ds.table_type, private: ds.private,
      refs_total: refs.length, pass: count("pass"), fail: count("fail"), missing: count("missing"),
      info: refs.filter((r) => r.status.startsWith("info")).length,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
      engine: u.timings, console_errors: [...log.errors], error,
      screenshot: `site-screens/${id}.png`, refs,
      notes: got.__notes ?? [],
    };
    rec.status = error && rec.pass === 0 ? "error" : rec.fail ? "FAIL" : rec.pass === 0 ? "not comparable"
      : rec.missing ? "pass (partial)" : "pass";
    results.push(rec);
    console.log(`${rec.status.padEnd(15)} ${id}: ${rec.pass} pass, ${rec.fail} fail, ${rec.missing} missing, ${rec.info} info (${rec.seconds}s)`);
    for (const r of refs.filter((x) => x.status === "fail")) {
      console.log(`      fail ${r.quantity}: ref ${r.reference} shown ${r.shown} (tol ${r.used_tolerance?.toPrecision(3)})`);
    }
    if (log.errors.length) {
      for (const e of log.errors) friction("console", `Console error during ${id}: ${e}`, id);
    }
  }
  await sess.ctx.close();
}

if (doPerf) {
  perf = await runPerf({ newSession, appUrl, browser, friction, REPO });
}
await browser.close();

// ----------------------------------------------------------------- report
const out = {
  site: baseUrl, run_at: new Date().toISOString(), partial_run: partial,
  manifests: manifests.map((m) => m.replace(REPO + "/", "")), session: sessionInfo,
  tolerance_rule: "manifest tolerance + half a unit in the last significant digit the page shows (two rounded numbers agree when their rounding intervals overlap); "
    + "the page strips trailing zeros, so a value is taken to carry the results precision setting "
    + `(${sessionInfo.digitsUsed ?? digits} significant digits; P values 4) unless it shows more)`,
  summary: {
    datasets: results.length,
    pass: results.filter((r) => r.status === "pass").length,
    partial: results.filter((r) => r.status === "pass (partial)").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    not_comparable: results.filter((r) => r.status === "not comparable" || r.status === "error").length,
    refs: results.reduce((a, r) => a + r.refs_total, 0),
    refs_pass: results.reduce((a, r) => a + r.pass, 0),
    refs_fail: results.reduce((a, r) => a + r.fail, 0),
    refs_missing: results.reduce((a, r) => a + r.missing, 0),
    refs_info: results.reduce((a, r) => a + r.info, 0),
  },
  datasets: results,
  frictions: [...frictions.values()].map((f) => ({ kind: f.kind, text: f.text, datasets: [...f.datasets] })),
  perf,
};
// The engine agent's native run of the same corpus, when present: lets the
// report say whether a site discrepancy is also an engine discrepancy.
const enginePath = join(VAL, "results-engine.json");
if (existsSync(enginePath)) {
  try {
    const e = JSON.parse(readFileSync(enginePath, "utf8"));
    const m = new Map((e.quantities ?? []).map((q) => [`${q.dataset}|${q.quantity}`, q]));
    out.engine_run = { file: "docs/validation/results-engine.json", generated_by: e.generated_by, totals: e.totals };
    for (const d of results) for (const r of d.refs) {
      const q = m.get(`${d.id}|${r.quantity}`);
      if (q) r.engine = { status: q.status, ours: q.ours ?? null, category: q.category ?? null };
    }
  } catch { /* ignore */ }
}
const base = outBase ? resolve(outBase) : join(VAL, partial ? "results-site.partial" : "results-site");
const jsonPath = `${base}.json`;
writeFileSync(jsonPath, JSON.stringify(out, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v), 1));
const { renderMarkdown } = await import("./validate-site-report.mjs");
writeFileSync(`${base}.md`, renderMarkdown(out));
console.log(`\nwrote ${jsonPath.replace(REPO + "/", "")}`);
console.log(JSON.stringify(out.summary));
