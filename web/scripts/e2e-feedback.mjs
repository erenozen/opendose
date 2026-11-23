// End-to-end check of the feedback primitives (DECISIONS 4 and
// 6): Open as a real button, toasts and the one announcer, banners that
// never take focus, the engine boot slot that moves nothing, and the
// Simulate dialog's busy button and late validation.
//
// Usage: node scripts/e2e-feedback.mjs http://localhost:5173/
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

// The header's File menu (DECISIONS 5): open it, pick an item.
const fileMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "File", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] ?? "http://localhost:5173/";
const withParams = (params) => {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};
const EXAMPLE = withParams({ example: "1" });
const PZFX = join(here, "..", "e2e-fixtures", "sample.pzfx");
const OPEN_INPUT = 'input[aria-label="Open an OpenDose project or a Prism file"]';
const tmp = mkdtempSync(join(tmpdir(), "opendose-feedback-"));

const fails = [];
const errors = [];
function expect(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) fails.push(name);
}

const browser = await chromium.launch();
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`pageerror (${tag}): ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console (${tag}): ${m.text()}`); });
};

/** Records every message added to the announcer's regions (each message
 *  is a node of its own, added once). */
const recordWrites = (page) => page.evaluate(() => {
  const w = { polite: [], assertive: [] };
  globalThis.__writes = w;
  for (const [key, sel] of [["polite", "[data-announcer] [role=status]"], ["assertive", "[data-announcer] [role=alert]"]]) {
    const el = document.querySelector(sel);
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n.textContent) w[key].push(n.textContent);
    }).observe(el, { childList: true, subtree: true });
  }
});
const writes = (page) => page.evaluate(() => globalThis.__writes);
const show = (page, message, opts) => page.evaluate(([m, o]) => globalThis.__opendoseToasts.show(m, o), [message, opts]);
const boxes = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)]
  .map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }), sel);

// ------------------------------------------------------------ the example
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
watch(page, "example");
await page.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 300000 });
await page.waitForTimeout(500);

// --- Open is a real button: File is reachable with Tab, and its Open…
// item opens the picker from the keyboard (DECISIONS 5)
{
  const file = page.locator("header").getByRole("button", { name: "File", exact: true });
  await page.locator("body").focus();
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await file.evaluate((el) => el === document.activeElement);
  }
  expect("header File menu is reachable with Tab", reached);
  await page.keyboard.press("Enter");
  const open = page.getByRole("menuitem", { name: /^Open…/ });
  await open.waitFor();
  // Focus moves into the menu after it opens: step only once an item has
  // it, and each step only after the last one landed, so no ArrowDown
  // reaches the File button or skips past Open….
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem"
    && !!document.activeElement.closest('[role="menu"]'), null, { timeout: 5000 });
  for (let i = 0; i < 10 && !(await open.evaluate((el) => el === document.activeElement)); i++) {
    const was = await page.evaluate(() => document.activeElement?.textContent ?? "");
    await page.keyboard.press("ArrowDown");
    // Wait for the step to land (it can take over a second under load);
    // a short wait here let the next ArrowDown skip past Open….
    await page.waitForFunction((w) => (document.activeElement?.textContent ?? "") !== w, was,
      { timeout: 5000 }).catch(() => {});
  }
  await page.waitForFunction((el) => el === document.activeElement, await open.elementHandle(),
    { timeout: 5000 }).catch(() => {});
  const chooser = page.waitForEvent("filechooser", { timeout: 5000 }).then(() => true, () => false);
  await page.keyboard.press("Enter");
  expect("Enter on File › Open… opens the file picker", await chooser);
  const inTabOrder = await page.locator(OPEN_INPUT).evaluate((el) => el.tabIndex);
  expect("the file input itself stays out of the tab order", inTabOrder === -1, String(inTabOrder));
  const chooser2 = page.waitForEvent("filechooser", { timeout: 5000 }).then(() => true, () => false);
  await page.keyboard.press("Control+o");
  expect("Ctrl+O opens the file picker", await chooser2);
}

// --- one notify, one live-region write; the toast is not a live region
await recordWrites(page);
const headerBefore = await boxes(page, "header, header button");
await show(page, "Restyled 2 graphs.", { tone: "success" });
await page.locator(".toast").first().waitFor();
await page.waitForTimeout(300);
{
  const w = await writes(page);
  expect("a notify is written to the polite region exactly once",
    w.polite.length === 1 && w.polite[0] === "Restyled 2 graphs." && w.assertive.length === 0, JSON.stringify(w));
  const liveInToasts = await page.locator(".toast-region [role=status], .toast-region [role=alert], .toast-region [aria-live]").count();
  expect("toasts are not live regions themselves (no double reading)", liveInToasts === 0, String(liveInToasts));
  const headerAfter = await boxes(page, "header, header button");
  expect("the header does not move when a message appears",
    JSON.stringify(headerBefore) === JSON.stringify(headerAfter));
  const focusInToast = await page.evaluate(() => !!document.activeElement?.closest(".toast-region"));
  expect("a toast does not take focus", !focusInToast);
}

// --- three quick messages stack, newest at the bottom, at most three
await show(page, "First of three.", { tone: "info" });
await show(page, "Second of three.", { tone: "info" });
await show(page, "Third of three.", { tone: "info" });
await page.waitForTimeout(400);
{
  const items = await page.evaluate(() => [...document.querySelectorAll(".toast:not([data-closing])")]
    .map((t) => ({ text: t.querySelector(".toast-message").textContent, r: t.getBoundingClientRect().toJSON() })));
  const texts = items.map((i) => i.text);
  const sorted = [...items].sort((a, b) => a.r.top - b.r.top).map((i) => i.text);
  const overlap = items.some((a, i) => items.some((b, j) => i !== j && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5));
  expect("three quick messages: three toasts, the newest at the bottom, none overlapping",
    texts.length === 3 && sorted.join("|") === "First of three.|Second of three.|Third of three." && !overlap,
    `${sorted.join(" | ")}${overlap ? " (overlap)" : ""}`);
  const w = await writes(page);
  expect("each of them written once", ["First of three.", "Second of three.", "Third of three."]
    .every((m) => w.polite.filter((x) => x === m).length === 1), JSON.stringify(w.polite));
  const right = items.map((i) => Math.round(1400 - i.r.right));
  const width = Math.round(items[0]?.r.width ?? 0);
  expect("the stack sits at the bottom right, 380 wide", width === 380 && right.every((x) => x === 16)
    && Math.round(Math.max(...items.map((i) => i.r.bottom))) === 900 - 16, `width ${width}, right ${right}`);
}

// --- F6 moves focus into the stack and back
{
  const grid = page.locator(".data-table input").first();
  await grid.focus();
  await page.keyboard.press("F6");
  const inStack = await page.evaluate(() => !!document.activeElement?.closest(".toast-region"));
  const paused = await page.evaluate(() => globalThis.__opendoseToasts.paused);
  await page.keyboard.press("F6");
  const back = await grid.evaluate((el) => el === document.activeElement);
  expect("F6 moves focus into the toasts (timers pause) and F6 returns it", inStack && paused && back,
    `in ${inStack}, paused ${paused}, back ${back}`);
}

// --- an error toast stays, is assertive, offers the next step
for (const t of await page.locator(".toast:not([data-closing]) .toast-dismiss").all()) await t.click().catch(() => {});
await page.waitForTimeout(300);
await recordWrites(page);
const bad = join(tmp, "not-a-project.json");
writeFileSync(bad, "{ \"this is\": \"not an OpenDose project\" }");
{
  const grid = page.locator(".data-table input").first();
  await grid.focus();
  await page.setInputFiles(OPEN_INPUT, bad);
  const err = page.locator('.toast[data-tone="error"]');
  await err.waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  const w = await writes(page);
  expect("a failed open is spoken once in the role=alert region",
    w.assertive.length === 1 && /^Could not open “not-a-project\.json”/.test(w.assertive[0]), JSON.stringify(w));
  expect("focus stays where it was when the error appears", await grid.evaluate((el) => el === document.activeElement));
  await page.mouse.move(5, 450);
  await page.waitForTimeout(6500);
  expect("the error toast stays past the auto-dismiss time", await err.count() === 1
    && await err.getAttribute("data-closing") === null);
  const chooser = page.waitForEvent("filechooser", { timeout: 5000 }).then(() => true, () => false);
  await err.getByRole("button", { name: "Choose another file" }).click();
  expect("'Choose another file' opens the picker and closes the error", await chooser
    && await page.locator('.toast[data-tone="error"]').count() === 0
      || await page.locator('.toast[data-tone="error"][data-closing]').count() === 1);
}

// --- a banner never takes focus; it is a named region
{
  const grid = page.locator(".data-table input").first();
  await grid.focus();
  await page.setInputFiles(OPEN_INPUT, PZFX);
  const chooser = page.getByRole("region", { name: /The Prism file has 2 data tables/ });
  await chooser.waitFor({ timeout: 120000 });
  expect("the Prism chooser is a region named by its title", await chooser.count() === 1);
  expect("the Prism chooser does not take focus", await grid.evaluate((el) => el === document.activeElement));
  expect("one filled primary: Import all", await chooser.locator(".btn--primary").count() === 1
    && (await chooser.locator(".btn--primary").innerText()).trim() === "Import all");
  expect("the chooser lists its tables as ticked checkboxes; Cancel is a keycap",
    await chooser.getByRole("checkbox").count() === 2
    && await chooser.getByRole("button", { name: "Cancel" }).evaluate((b) => b.classList.contains("btn--secondary")));
  await chooser.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(400);
  expect("Cancel closes the chooser", await page.locator(".pzfx-chooser").count() === 0);
}
await ctx.close();

// ------------------------------------------------------------ the engine boot
// The runtime download stalls on SciPy until released (ui-stage's
// technique); the example's saved results show with the boot banner.
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const held = [];
  let release = false;
  await c.route(/\/pyodide\/|cdn\.jsdelivr\.net/, (route) => {
    if (!release && /scipy-[^/]*\.whl/.test(route.request().url())) { held.push(route); return; }
    return route.continue();
  });
  const p = await c.newPage();
  watch(p, "boot");
  await p.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
  const banner = p.getByRole("region", { name: "Analysis engine" });
  await banner.waitFor({ timeout: 60000 });
  await p.waitForFunction(() => /[1-9]/.test(
    document.querySelector(".engine-boot-note .engine-slot-bytes")?.textContent?.split(" of ")[0] ?? ""),
  null, { timeout: 60000 });
  // What the slot's live region says, change by change.
  await p.evaluate(() => {
    const st = document.querySelector(".engine-boot-note .engine-slot [role=status]");
    globalThis.__phases = [st.textContent];
    new MutationObserver(() => globalThis.__phases.push(st.textContent))
      .observe(st, { childList: true, characterData: true, subtree: true });
  });
  const slot = p.locator(".engine-boot-note .engine-slot");
  const words1 = await slot.getByRole("status").innerText();
  const bytesHidden = await slot.locator(".engine-slot-bytes").getAttribute("aria-hidden");
  const barTransform = await slot.locator(".engine-slot-fill").evaluate((e) => e.style.transform);
  const slotBox = await slot.boundingBox();
  expect("boot slot: phase words in the status, bytes hidden from screen readers, bar by scaleX",
    words1 === "Downloading the analysis engine" && bytesHidden === "true" && /^scaleX\(0\.\d+\)$/.test(barTransform),
    `${words1} | ${bytesHidden} | ${barTransform}`);
  expect("boot slot is 340 x 34", Math.round(slotBox.width) === 340 && Math.round(slotBox.height) === 34,
    `${slotBox.width} x ${slotBox.height}`);
  // The boot banner and the panes under it (their tops: the live results
  // may differ in length from the saved ones, which is not a shift).
  const PANES = ".pane-boot, .pane-plot, .pane-results";
  const before = await boxes(p, PANES);
  release = true;
  for (const r of held.splice(0)) await r.continue();
  await p.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 300000 });
  await p.waitForFunction(() => document.querySelector(".engine-boot-note .engine-slot")?.dataset.enginePhase === "ready",
    null, { timeout: 60000 });
  await p.waitForTimeout(600);
  const after = await boxes(p, PANES);
  const moved = before.map((b, i) => [b, after[i]]).filter(([a, b], i) => !b || a[0] !== b[0] || a[1] !== b[1]
    || (i === 0 && a[3] !== b[3]));
  expect("engine boot to ready moves nothing (the boot banner keeps its height; plot and results keep their place)",
    before.length === after.length && moved.length === 0, JSON.stringify(moved));
  expect("the banner says the results are live", /Results are live/.test(await banner.innerText()));
  const phases = (await p.evaluate(() => globalThis.__phases)).filter(Boolean);
  expect("the slot's live region changes once per phase and never carries the byte count",
    phases.at(-1) === "Ready: analyses run on this device" && phases.length === new Set(phases).size
      && !phases.some((x) => /MB|\d/.test(x)), JSON.stringify(phases));
  await c.close();
}

// ------------------------------------------------------------ first visit during the engine stall
// No start screen: the example with its shipped result, the boot in the
// banner's fixed slot. Layout shift is measured with a PerformanceObserver
// while the runtime download is held (DECISIONS 4: CLS 0), then a paste
// during the boot, then a failed boot with a pasted table.
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await c.route(/\/pyodide\/|cdn\.jsdelivr\.net/, (route) => {
    if (/scipy-[^/]*\.whl/.test(route.request().url())) return; // held for good
    return route.continue();
  });
  await c.addInitScript(() => {
    globalThis.__shifts = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) globalThis.__shifts.push(e.value);
    }).observe({ type: "layout-shift", buffered: true });
  });
  const p = await c.newPage();
  watch(p, "first visit");
  await p.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await p.locator(".example-banner").waitFor({ timeout: 60000 });
  await p.waitForFunction(() => /[1-9]/.test(
    document.querySelector(".engine-boot-note .engine-slot-bytes")?.textContent?.split(" of ")[0] ?? "")
    || document.querySelector('.engine-boot-note [data-engine-phase="start"]'), null, { timeout: 60000 });
  await p.waitForTimeout(3000);
  const shifts = await p.evaluate(() => globalThis.__shifts);
  expect("first visit: from the first paint through the engine download nothing shifts (CLS 0)",
    shifts.reduce((a, b) => a + b, 0) === 0, JSON.stringify(shifts));
  expect("first visit: the shipped result is on screen, said to be computed when this version was built",
    (await p.locator(".answer-provenance").first().innerText()).startsWith("Computed when this version was built")
    && await p.locator(".answer-figure").first().isVisible());
  await p.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, "Conc\tRep 1\tRep 2\n0.001\t98\t101\n0.01\t95\t97\n0.1\t70\t66\n1\t30\t35\n10\t5\t8\n");
  const pasted = p.getByRole("region", { name: /pasted, read as an XY table/ });
  await pasted.waitFor({ timeout: 10000 });
  expect("the paste banner is a region named by its title and does not take focus",
    await pasted.count() === 1 && await p.evaluate(() => document.activeElement === document.body));
  expect("the paste banner has one filled primary, the verb, and a keycap Undo",
    await pasted.locator(".btn--primary").count() === 1
    && (await pasted.locator(".btn--primary").innerText()).trim() === "Fit the curve"
    && await pasted.getByRole("button", { name: /^Undo/ }).evaluate((b) => b.classList.contains("btn--secondary")));
  const boot = p.getByRole("region", { name: "Analysis engine" });
  expect("pasted during the boot: the boot banner says when it is analysed; the headline waits",
    (await boot.innerText()).includes("Your table is analysed as soon as the engine has loaded.")
    && (await p.locator(".answer-provenance").first().innerText()) === "Waiting for the analysis engine.");
  await c.close();
}
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await c.route(/\/pyodide\/|cdn\.jsdelivr\.net/, (route) => route.abort("connectionrefused"));
  const p = await c.newPage();
  // Refused downloads log console errors by design: page errors only.
  p.on("pageerror", (e) => errors.push(`pageerror (failed boot): ${e.message}`));
  await p.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await p.locator(".example-banner").waitFor({ timeout: 60000 });
  const boot = p.getByRole("region", { name: "Analysis engine" });
  await boot.getByRole("button", { name: "Try again" }).waitFor({ timeout: 120000 });
  expect("failed boot on the example: the shipped result stays on screen, relabelled",
    (await boot.innerText()).includes("These are saved results")
    && await p.locator(".answer-figure").first().isVisible());
  await p.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, "Conc\tRep 1\tRep 2\n0.001\t98\t101\n0.01\t95\t97\n0.1\t70\t66\n1\t30\t35\n10\t5\t8\n");
  await p.locator(".paste-banner").waitFor({ timeout: 10000 });
  await p.waitForTimeout(1000);
  const text = await boot.innerText();
  expect("failed boot with a pasted table: what failed, that the table is kept, the next step, a primary Try again",
    text.includes("Nothing could be fitted: the analysis engine did not load.")
    && text.includes("Your table is kept. Check the connection, then try again.")
    && (await boot.locator(".btn--primary").innerText()).trim() === "Try again"
    && (await p.locator(".answer-provenance").first().innerText()) === "No result: the analysis engine did not load.",
    text);
  await c.close();
}

// ------------------------------------------------------------ Simulate data
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await c.newPage();
  watch(p, "simulate");
  await p.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 300000 });
  await fileMenu(p, "New data table…");
  await p.getByRole("button", { name: "Simulate data…" }).click();
  const dlg = p.locator(".simulate-dialog");
  const seed = dlg.getByLabel("Random seed");
  await seed.pressSequentially("4x");
  const errWhileTyping = await dlg.locator(".ui-field-error:not([hidden])").count();
  await seed.press("Tab");
  const errAfterBlur = await dlg.locator(".ui-field-error:not([hidden])").innerText().catch(() => "");
  const invalid = await seed.getAttribute("aria-invalid");
  await seed.fill("42");
  const errFixed = await dlg.locator(".ui-field-error:not([hidden])").count();
  expect("seed: no error while typing, shown after leaving the field, cleared as soon as it is valid",
    errWhileTyping === 0 && /whole number/.test(errAfterBlur) && invalid === "true" && errFixed === 0,
    `${errWhileTyping} | ${errAfterBlur} | ${invalid} | ${errFixed}`);
  const sd = dlg.getByLabel("SD", { exact: true });
  await sd.fill("");
  await sd.pressSequentially("x");
  const formWhileTyping = (await dlg.locator(".sim-status").innerText()).trim();
  await dlg.getByLabel("Table name").focus();
  const formAfterBlur = (await dlg.locator(".sim-status").innerText()).trim();
  await sd.fill("5");
  const formFixed = (await dlg.locator(".sim-status").innerText()).trim();
  expect("form problem: silent while typing, shown after leaving a field, gone once fixed",
    formWhileTyping === "" && /SD/.test(formAfterBlur) && formFixed === "",
    `${formWhileTyping} | ${formAfterBlur} | ${formFixed}`);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll(".simulate-dialog button")].find((x) => x.textContent.includes("Create table"));
    globalThis.__busySeen = false;
    new MutationObserver(() => {
      if (b.hasAttribute("data-busy") && b.getAttribute("aria-disabled") === "true" && /Simulating…/.test(b.querySelector('[data-shown="true"]')?.textContent ?? "")) {
        globalThis.__busySeen = true;
        globalThis.__busyWidth = b.getBoundingClientRect().width;
      }
    }).observe(b, { attributes: true, subtree: true });
  });
  const create = dlg.getByRole("button", { name: "Create table" });
  // Measure at rest: the dialog's entrance scale (0.97 to 1) may still be
  // running after the quick steps above, and it narrows the box.
  await dlg.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished.catch(() => {}))));
  const w0 = await create.evaluate((b) => b.getBoundingClientRect().width);
  await create.dblclick(); // a double click must make one table
  await p.waitForSelector(".origin-note", { timeout: 30000 });
  expect("Create table says 'Simulating…' and is disabled while the engine works",
    await p.evaluate(() => globalThis.__busySeen));
  const w1 = await p.evaluate(() => globalThis.__busyWidth);
  expect("the busy label keeps the button's width", w1 === w0, `${w0} -> ${w1}`);
  await p.waitForTimeout(1500);
  const made = await p.getByRole("treeitem", { name: /^Simulated data \d+$/ }).count();
  expect("a double click on Create table makes one table, not two", made === 1, String(made));
  await c.close();
}

await browser.close();
console.log("errors:", errors.length ? errors : "none");
if (fails.length || errors.length) {
  console.error("FAILURES:", [...fails, ...errors]);
  process.exit(1);
}
console.log("feedback primitives OK");
