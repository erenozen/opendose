// End-to-end check of large pasted tables (P-10): ROWS rows (default
// 200,000, above the ~126,000 values a Math.min(...values) spread can
// take before V8 throws "RangeError: Maximum call stack size exceeded")
// pasted into a new column table and into a new XY table, then the graph
// drawn on the WebGL path and the analysis run, with no page error. Each
// phase prints its time and the page's JavaScript heap.
//   node scripts/e2e-large.mjs http://localhost:5173/ [ROWS]
// Run it alone, through the memory-capped slot where one exists: the
// paste of 200,000 rows takes about 2.5 GB at its peak.
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:5173/";
const N = Number(process.argv[3] ?? 200000);
const url = (() => {
  const u = new URL(baseUrl);
  u.searchParams.set("example", "1");
  return u.toString();
})();
const errors = [];
const fail = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};

let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// each table type in a fresh browser, so one run's memory does not carry over
for (const type of ["column", "xy"]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`); });
  const heap = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return `${(metrics.find((m) => m.name === "JSHeapUsedSize").value / 2 ** 20).toFixed(0)} MB heap`;
  };
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  await page.locator("header").getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New data table…" }).click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator(`input[name="table-type"][value="${type}"]`).check();
  await dlg.getByLabel("Table name").fill(`Large ${type}`);
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.waitForTimeout(400);
  // column: two groups; XY: X and one Y (a line with noise)
  const text = Array.from({ length: N }, (_, i) => (type === "xy"
    ? `${(i / 1000).toFixed(3)}\t${(2 + 0.5 * i / 1000 + rnd()).toFixed(3)}`
    : `${(10 + 3 * rnd()).toFixed(3)}\t${(10.4 + 3 * rnd()).toFixed(3)}`)).join("\n");
  const t0 = Date.now();
  await page.evaluate((txt) => {
    const el = document.querySelector('.data-table tbody input[aria-label$=", row 1"]');
    const dt = new DataTransfer();
    dt.setData("text/plain", txt);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
  const imp = page.locator(".import-dialog");
  await imp.waitFor({ timeout: 300000 });
  await imp.getByRole("tab", { name: "Placement" }).click({ timeout: 300000 });
  await imp.getByLabel(/In place of the table/).check({ timeout: 300000 });
  await imp.getByRole("button", { name: "Import", exact: true }).click({ timeout: 300000, noWaitAfter: true });
  const pasted = await page.waitForFunction((n) => Number(document.querySelector(".data-table table")?.dataset.rows) >= n,
    N, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
  expect(`${type}: ${N.toLocaleString("en")} pasted rows reach the grid`, pasted,
    `${Date.now() - t0} ms, ${await heap()}`);
  const g0 = Date.now();
  const gl = await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?._fullData ?? [])
    .some((t) => t.type === "scattergl"), null, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
  expect(`${type}: the graph draws on the WebGL path (scattergl)`, gl, `${Date.now() - g0} ms, ${await heap()}`);
  const a0 = Date.now();
  if (type === "column") await page.locator(".analysis-select").first().selectOption("ttest");
  else {
    // a new XY table of non-dose data asks for a model: Analyze › Linear regression
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Linear regression/ }).click();
  }
  const want = type === "column" ? /P value \(two-tailed\)/ : /Slope/;
  const live = await page.waitForFunction((re) => new RegExp(re).test(document.querySelector(".pane-results")?.textContent ?? "")
    && !!document.querySelector('.pane-results[data-live="true"]'), want.source,
  { timeout: 900000, polling: 1000 }).then(() => true, () => false);
  expect(`${type}: the analysis (${type === "column" ? "unpaired t test" : "linear regression"}) returns live results`,
    live, `${Date.now() - a0} ms, ${await heap()}`);
  const range = errors.filter((e) => /RangeError|call stack/i.test(e));
  expect(`${type}: no RangeError (call stack) anywhere on the way`, range.length === 0, range.join(" | "));
  await browser.close();
}

console.log(errors.length ? errors.join("\n") : "no page errors");
if (fail.length || errors.length) {
  console.log(`\n${fail.length} check(s) failed${errors.length ? `, ${errors.length} page error(s)` : ""}`);
  process.exit(1);
}
console.log("\nall large-data checks passed");
