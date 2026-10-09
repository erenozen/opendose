// Accessibility audit of the analysis controls (axe-core): creates an
// example table of every type, adds every analysis the Analyze menu offers
// for it, and runs axe's "select-name", "label" and related form rules on
// the controls panel; for the column analyses it also walks every test of
// the analysis select. Prints each violation once with where it was seen.
// Usage: node scripts/a11y-audit.mjs http://localhost:5202/
import { chromium } from "playwright";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const RULES = ["select-name", "label", "aria-input-field-name", "button-name", "input-button-name"];
const TYPES = ["xy", "column", "grouped", "contingency", "survival", "partsofwhole",
  "multivariable", "nested"];

const baseUrl = process.argv[2] ?? "http://localhost:5202/";
const url = new URL(baseUrl);
url.searchParams.set("example", "1");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForSelector(".results-table", { timeout: 180000 });

const found = new Map(); // key -> {rule, html, where:Set}
async function audit(where) {
  await page.addScriptTag({ path: AXE }).catch(() => {});
  const res = await page.evaluate(async (rules) => {
    const root = document.querySelector(".pane-controls");
    if (!root) return [];
    // eslint-disable-next-line no-undef
    const r = await axe.run(root, { runOnly: { type: "rule", values: rules } });
    return r.violations.flatMap((v) => v.nodes.map((n) => ({ rule: v.id, html: n.html.slice(0, 160),
      target: n.target.join(" ") })));
  }, RULES);
  for (const v of res) {
    const key = `${v.rule}|${v.html}`;
    if (!found.has(key)) found.set(key, { ...v, where: new Set() });
    found.get(key).where.add(where);
  }
}

const settle = () => page.waitForTimeout(900);
const closeOverlays = async () => {
  for (let i = 0; i < 3; i++) {
    if (await page.locator("dialog[open], .modal, [role=dialog]").count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }
};

for (const type of TYPES) {
  await page.getByRole("button", { name: "New data table" }).click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator(`input[name="table-type"][value="${type}"]`).check();
  const ex = dlg.getByLabel("Example data");
  if (await ex.count()) await ex.check();
  await dlg.getByRole("button", { name: "Create table" }).click();
  await settle();
  await audit(`${type}: default analysis`);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  const items = (await page.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press("Escape");
  for (const label of items) {
    if (/Which test|Help me choose|Assay:|Monte Carlo|Simulate/.test(label)) continue;
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    const item = page.getByRole("menuitem", { name: label, exact: true }).first();
    if (!(await item.count())) { await page.keyboard.press("Escape"); continue; }
    await item.click();
    await settle();
    await closeOverlays();
    await audit(`${type}: ${label}`);
    // the column analyses hold several tests behind one select
    const sel = page.locator(".pane-controls select.analysis-select");
    if (await sel.count()) {
      const values = await sel.locator("option").evaluateAll((os) => os.map((o) => o.value));
      for (const v of values) {
        await sel.selectOption(v);
        await settle();
        await audit(`${type}: ${label} / ${v}`);
      }
    }
  }
}

const list = [...found.values()];
for (const v of list) {
  console.log(`${v.rule}: ${v.html}\n    seen in: ${[...v.where].slice(0, 4).join("; ")}${v.where.size > 4 ? ` (+${v.where.size - 4})` : ""}`);
}
console.log(`\n${list.length} distinct violations`);
await browser.close();
process.exit(list.length ? 1 : 0);
