// End-to-end smoke test: boots the app in headless Chromium, waits for
// Pyodide + SciPy, checks the default fit, then exercises the plate-import
// workflow with the synthetic SRB fixture and checks both cell-line fits.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const XLSX = join(here, "..", "..", "engine", "tests", "fixtures",
  "synthetic_srb_plate.xlsx");

const url = process.argv[2] ?? "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".results-table", { timeout: 180000 });
const logRow = await page
  .locator(".results-table tbody tr", { hasText: "LogIC50" })
  .first()
  .innerText();
console.log("default fit LogIC50 row:", logRow.replace(/\s+/g, " "));

// --- plate import flow ---
await page.getByText("Import plate (SRB").click();
await page.setInputFiles('.plate-form input[type="file"]', XLSX);
await page
  .getByPlaceholder("e.g. Control, Resistant")
  .fill("Line S, Line R");
await page.getByRole("button", { name: /Import → data table/ }).click();
await page.waitForFunction(
  () => document.querySelectorAll(".result-card .derived").length >= 2,
  { timeout: 60000 },
);
await page.waitForTimeout(1200);

for (const card of await page.locator(".result-card:has(.derived)").all()) {
  const name = await card.locator("h3").innerText();
  const ic50 = await card.locator(".derived").first().innerText();
  console.log(`${name.trim()}: ${ic50.replace(/\s+/g, " ")}`);
}
const methods = await page.locator(".methods-text p").first().innerText();
console.log("methods text present:", methods.length > 50);

// --- column statistics mode (on the two imported SRB datasets) ---
await page.getByRole("tab", { name: "Column · Statistics" }).click();
await page.waitForSelector(".stat-cols", { timeout: 30000 });
const normality = await page.locator(".stat-cols").first().innerText();
console.log("column stats has Shapiro-Wilk:", normality.includes("Shapiro-Wilk"));

// first select = graph type, second = analysis picker
await page.locator(".analysis-select").selectOption("anova");
await page.waitForSelector(".result-card h3:has-text('ANOVA')", { timeout: 30000 });
await page.waitForTimeout(400);
const anovaText = await page.locator(".result-card").first().innerText();
const fLine = anovaText.split("\n").find((l) => l.startsWith("F ("));
const tukeyLine = anovaText.split("\n").find((l) => l.includes(" vs. "));
console.log("ANOVA:", fLine, "| first Tukey row:", tukeyLine?.slice(0, 60));

// --- column graph types: box plot renders without errors ---
await page.locator(".graph-select").selectOption("box");
await page.waitForTimeout(600);
console.log("box plot traces:",
  await page.locator(".plot .trace.boxes, .plot .boxlayer path").count());

// --- contingency mode (prefilled 2x2 example) ---
await page.getByRole("tab", { name: "Contingency" }).click();
await page.waitForSelector(".result-card h3:has-text('Contingency')", {
  timeout: 30000,
});
const fisher = await page
  .locator(".results-table tr", { hasText: "Fisher" })
  .first()
  .innerText();
console.log("contingency:", fisher.replace(/\s+/g, " "));

// --- survival mode (auto-loads the example dataset) ---
await page.getByRole("tab", { name: "Survival" }).click();
await page.waitForSelector(".result-card h3:has-text('Kaplan-Meier')", {
  timeout: 30000,
});
await page.waitForTimeout(800);
const kmText = await page
  .locator(".result-card", { hasText: "Kaplan-Meier" }).innerText();
const logrankLine = kmText.split("\n").find((l) => l.includes("Log-rank"));
console.log("survival:", logrankLine
  ? logrankLine.replace(/\t/g, " ").slice(0, 70)
  : `NO LOGRANK LINE — card was: ${kmText.replace(/\s+/g, " ").slice(0, 120)}`);

// --- .pzfx import via the header Open button ---
const PZFX = join(here, "..", "e2e-fixtures", "sample.pzfx");
await page.setInputFiles('.load-btn input[type="file"]', PZFX);
await page.waitForSelector(".pzfx-chooser", { timeout: 30000 });
await page.locator(".pzfx-chooser button", { hasText: "Dose response" }).click();
await page.waitForSelector(".results-table", { timeout: 60000 });
await page.waitForTimeout(1200);
const pzfxRow = await page
  .locator(".results-table tbody tr", { hasText: /Log(IC|EC)50/ })
  .first()
  .innerText();
console.log("pzfx-imported fit midpoint row:", pzfxRow.replace(/\s+/g, " "));

await page.screenshot({
  path: join(here, "app.png"),
  fullPage: true,
});
console.log("errors:", errors.length ? errors : "none");
await browser.close();
