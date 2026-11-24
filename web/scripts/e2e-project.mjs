// End-to-end check of the project file and its history in this browser:
// save in place and Save as… with the File System Access API, the
// installed app's file handler and the web app manifest (P-71); saved
// versions and recent projects (P-72); comparing two versions (P-73);
// adding another project's families, from File and by a drop (P-74);
// the lab kit's round trip through Forget this computer's data (P-75).
//
// Playwright cannot answer the browser's own file pickers, so the
// Chromium checks stand in a small file system for them (FSA_MOCK: the
// pickers, handles that record what is written, launchQueue). The
// fallback that Firefox and Safari take is checked in Chromium with the
// API removed, and in Firefox when Playwright's Firefox is installed.
//
// Usage: node scripts/e2e-project.mjs http://localhost:5173/
import { chromium, firefox } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { projectSchemaErrors } from "./validate-project.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] ?? "http://localhost:5173/";
const EXAMPLE = (() => { const u = new URL(baseUrl); u.searchParams.set("example", "1"); return u.toString(); })();
const STUDY_FILE = join(here, "..", "e2e-fixtures", "project-study.json");
const STUDY = readFileSync(STUDY_FILE, "utf8");
// scipy.stats.ttest_ind(equal_var=False): e2e-fixtures/reference/compare_versions_ttest.py
const REF = JSON.parse(readFileSync(join(here, "..", "e2e-fixtures", "reference",
  "compare_versions_ttest.json"), "utf8"));
const OPEN_INPUT = 'input[aria-label="Open an OpenDose project or a Prism file"]';

const fails = [];
const errors = [];
function expect(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) fails.push(name);
}
const checkSchema = (what, json) => {
  const errs = projectSchemaErrors(json);
  expect(`schema: ${what} validates against docs/project-file.schema.json`, errs.length === 0,
    errs.slice(0, 5).join(" | "));
};
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`pageerror (${tag}): ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console (${tag}): ${m.text()}`); });
};
const fileMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "File", exact: true }).click();
  // the name may end with the shortcut ("Open…Ctrl+O")
  const esc = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await p.getByRole("menuitem", { name: new RegExp(`^${esc}`) }).click();
};
const fileMenuItems = async (p) => {
  await p.locator("header").getByRole("button", { name: "File", exact: true }).click();
  const items = await p.getByRole("menuitem").allInnerTexts();
  await p.keyboard.press("Escape");
  return items.map((s) => s.split("\n")[0].trim());
};
const toast = (p, re, timeout = 30000) => p.locator(".toast", { hasText: re }).first()
  .waitFor({ timeout }).then(() => true, () => false);
const live = (p, timeout = 240000) => p.locator('.pane-results[data-live="true"]').first()
  .waitFor({ timeout }).then(() => true, () => false);
const fileText = (p) => p.evaluate(() => globalThis.__opendoseFile.text());
const linked = (p) => p.evaluate(() => globalThis.__opendoseFile.linked());
/** Wait until what Save would write stops changing (results arrived). */
async function settled(p) {
  let last = "";
  for (let i = 0; i < 240; i++) {
    const now = await fileText(p);
    if (now === last) return;
    last = now;
    await p.waitForTimeout(1000);
  }
}
/** Every saved version in this browser (IndexedDB "opendose"), newest first. */
const storedVersions = (p) => p.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open("opendose");
  req.onsuccess = () => {
    const tx = req.result.transaction("autosave", "readonly");
    const all = tx.objectStore("autosave").getAll();
    const keys = tx.objectStore("autosave").getAllKeys();
    tx.oncomplete = () => resolve(keys.result.map((k, i) => [k, all.result[i]])
      .filter(([k]) => String(k).startsWith("version:")).map(([, v]) => v)
      .sort((a, b) => b.savedAt - a.savedAt));
  };
  req.onerror = () => resolve([]);
}));
/** A value's text in the grid, and whether it is excluded. */
const cell = (p, label) => p.locator(`.data-table input[aria-label="${label}"]`);
async function excludeCell(p, label, reason) {
  await cell(p, label).click();
  await p.keyboard.press("Control+e");
  const prompt = p.getByRole("region", { name: "Exclusion reason" });
  await prompt.getByLabel("Other reason for excluding").fill(reason);
  await prompt.getByRole("button", { name: "Save reason" }).click();
}
/** The numbers in "0.1063 → 0.003163". */
const arrowNumbers = (s) => (s.split(":").pop() ?? "").split("→").map((x) => Number(x.trim().split(/\s/)[0]));
const near = (shown, ref, digits = 4) => Math.abs(shown - ref) <= Math.abs(ref) * 0.5 * 10 ** (1 - digits);

// A stand-in file system for the File System Access API (Chromium).
const FSA_MOCK = () => {
  const disk = (window.__disk = {});
  const perm = (window.__perm = {});
  window.__writes = 0;
  const handle = (name) => ({
    kind: "file", name,
    async getFile() { return new File([disk[name] ?? ""], name, { type: "application/json" }); },
    async createWritable() {
      let buf = "";
      return {
        async write(d) { buf += typeof d === "string" ? d : await d.text(); },
        async close() { disk[name] = buf; window.__writes++; },
      };
    },
    async queryPermission() { return perm[name] ?? "granted"; },
    async requestPermission() { return perm[`${name}:request`] ?? perm[name] ?? "granted"; },
  });
  window.__handle = handle;
  window.showOpenFilePicker = async () => {
    const n = window.__nextOpen;
    if (!n) throw new DOMException("The user aborted a request.", "AbortError");
    return [handle(n)];
  };
  window.showSaveFilePicker = async (o) => {
    window.__suggested = o?.suggestedName;
    const n = window.__nextSave;
    if (!n) throw new DOMException("The user aborted a request.", "AbortError");
    return handle(n);
  };
  // Chromium has a read-only launchQueue of its own: shadow it.
  Object.defineProperty(window, "launchQueue", {
    configurable: true, value: { setConsumer(fn) { window.__launch = fn; } },
  });
};

const browser = await chromium.launch();

// ------------------------------------------------------------ P-71 in Chromium
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(FSA_MOCK);
  const page = await ctx.newPage();
  watch(page, "save in place");
  let downloads = 0;
  page.on("download", () => { downloads++; });
  await page.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
  await page.locator(".shell").waitFor({ timeout: 60000 });

  // the web app manifest: installable, its file handlers, the site's scope
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href");
    if (!href) return null;
    const m = await (await fetch(href)).json();
    const icons = await Promise.all(m.icons.map(async (i) => (await fetch(i.src)).status));
    return { href, m, icons };
  });
  const accept = manifest ? Object.values(manifest.m.file_handlers?.[0]?.accept ?? {}).flat() : [];
  expect("P-71 the page links a web app manifest", manifest?.href === "/manifest.webmanifest", manifest?.href);
  expect("P-71 the manifest opens .json, .pzfx and .prism files in the installed app",
    [".json", ".pzfx", ".prism"].every((x) => accept.includes(x)) && manifest?.m.file_handlers[0].action === "/",
    accept.join(","));
  expect("P-71 the manifest's scope is the offline cache's (the site root), every icon is served",
    manifest?.m.scope === "/" && manifest?.m.start_url === "/" && manifest.icons.every((s) => s === 200)
      && manifest.m.icons.some((i) => i.sizes === "512x512") && manifest.m.icons.some((i) => i.sizes === "192x192"),
    JSON.stringify(manifest?.icons));

  // Open… through the system picker: the file stays linked
  expect("P-71 File has Save as… where the browser can write a picked file",
    (await fileMenuItems(page)).includes("Save as…"));
  await page.evaluate((t) => { window.__disk["study.json"] = t; window.__nextOpen = "study.json"; }, STUDY);
  await fileMenu(page, "Open…");
  expect("P-71 Open… opens the picked file", await toast(page, /Opened “study\.json”/));
  expect("P-71 the opened file is linked", await linked(page) === "study.json", String(await linked(page)));
  expect("P-71 the opened project's results are computed", await live(page));

  // edit, Ctrl+S: the same file changes, no download
  await cell(page, "Treated, row 1").fill("12.0");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await live(page);
  await settled(page);
  await page.keyboard.press("Control+s");
  const saved = await toast(page, /Saved “study\.json”/);
  const disk = await page.evaluate(() => window.__disk["study.json"]);
  const expected = await fileText(page);
  expect("P-71 Ctrl+S writes back into the opened file and says so", saved && disk !== STUDY);
  expect("P-71 the bytes written equal serializeProject (what Save project downloads)", disk === expected,
    `${disk?.length} vs ${expected.length}`);
  expect("P-71 the edit is in the file on disk",
    JSON.parse(disk).sheets[0].table.datasets[1].rows[0][0] === "12.0");
  checkSchema("a project saved in place", JSON.parse(disk));
  await page.waitForTimeout(1500);
  expect("P-71 no download appears when saving in place", downloads === 0, String(downloads));

  // Save as…: a new file, which Save then writes to
  await page.evaluate(() => { window.__nextSave = "study-copy.json"; });
  await settled(page);
  await fileMenu(page, "Save as…");
  expect("P-71 Save as… writes the picked file", await toast(page, /Saved “study-copy\.json”/)
    && await page.evaluate(() => window.__disk["study-copy.json"]) === await fileText(page));
  expect("P-71 Save as… suggests the opened file's name", await page.evaluate(() => window.__suggested) === "study.json");
  await cell(page, "Treated, row 2").fill("12.9");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__disk["study.json"]);
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => (window.__disk["study-copy.json"] ?? "").includes('"12.9"'), null,
    { timeout: 10000 }).catch(() => {});
  expect("P-71 after Save as…, Ctrl+S writes the new file and leaves the old one",
    (await page.evaluate(() => window.__disk["study-copy.json"])).includes('"12.9"')
    && await page.evaluate(() => window.__disk["study.json"]) === before && downloads === 0);

  // permission refused: nothing written, an error with the next step
  await page.evaluate(() => { window.__perm["study-copy.json"] = "denied"; });
  const writes = await page.evaluate(() => window.__writes);
  await page.keyboard.press("Control+s");
  const err = page.locator('.toast[data-tone="error"]', { hasText: /Could not save “study-copy\.json”: permission to write the file was not given\./ });
  expect("P-71 a refused permission is an error toast with Save as…",
    await err.waitFor({ timeout: 10000 }).then(() => true, () => false)
    && await err.getByRole("button", { name: "Save as…" }).count() === 1
    && await page.evaluate(() => window.__writes) === writes);
  await err.getByRole("button", { name: /Dismiss/ }).click().catch(() => {});

  // the installed app's file handler opens through Open's path
  await page.evaluate((t) => {
    window.__disk["launched.json"] = t.replace('"title": "Study"', '"title": "Launched study"');
    window.__launch({ files: [window.__handle("launched.json")] });
  }, STUDY);
  expect("P-71 a file launched in the installed app opens like Open… (same toast, same project)",
    await toast(page, /Opened “launched\.json”/)
    && await page.locator("header").getByLabel("Project title").inputValue() === "Launched study");
  expect("P-71 the launched file is linked", await linked(page) === "launched.json");
  await settled(page);
  await page.keyboard.press("Control+s");
  expect("P-71 Ctrl+S writes the launched file", await toast(page, /Saved “launched\.json”/)
    && await page.evaluate(() => window.__disk["launched.json"]) === await fileText(page));

  // another project on screen: Save no longer writes to the old file
  await fileMenu(page, "New project…");
  await page.getByRole("alertdialog", { name: "Start a new project?" })
    .getByRole("button", { name: "New project" }).click();
  expect("P-71 New project unlinks the file", await linked(page) === null);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
    page.keyboard.press("Control+s")]);
  expect("P-71 an unlinked project downloads on Ctrl+S, as before", !!dl);
  await ctx.close();
}

// ------------------------------------------------------------ P-71 fallback
// What Firefox and Safari do: Chromium with the API taken away.
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // (operations of the global object are its own properties)
  await ctx.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showSaveFilePicker;
  });
  const page = await ctx.newPage();
  watch(page, "fallback");
  await page.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
  await page.locator(".shell").waitFor({ timeout: 60000 });
  const items = await fileMenuItems(page);
  expect("P-71 without the API, File has no Save as…", !items.includes("Save as…")
    && items.includes("Save project"), items.join("|"));
  const chooser = page.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null);
  await fileMenu(page, "Open…");
  const fc = await chooser;
  expect("P-71 without the API, Open… opens the file input", !!fc);
  if (fc) await fc.setFiles(STUDY_FILE);
  expect("P-71 without the API, the file opens", await toast(page, /Opened “project-study\.json”/));
  await live(page);
  await settled(page);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
    page.keyboard.press("Control+s")]);
  const text = dl ? readFileSync(await dl.path(), "utf8") : "";
  expect("P-71 without the API, Ctrl+S downloads serializeProject's bytes, unchanged",
    !!dl && dl.suggestedFilename() === "study.json" && text === await fileText(page),
    dl?.suggestedFilename());
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "About OpenDose…" }).click();
  const about = page.getByRole("dialog", { name: "About OpenDose" });
  expect("P-71 About says this browser cannot install the app and how files open",
    /cannot install OpenDose as an app that opens files/.test(await about.innerText()));
  await about.getByRole("button", { name: "Close" }).click();
  await ctx.close();
}

// ------------------------------------------------------------ P-71 Firefox
{
  let ff = null;
  try { ff = await firefox.launch(); } catch (e) {
    // an older Playwright Firefox build in the cache, if it still speaks the protocol
    const cache = join(homedir(), ".cache", "ms-playwright");
    const older = existsSync(cache) ? readdirSync(cache).filter((d) => /^firefox-\d+$/.test(d)).sort().reverse() : [];
    for (const d of older) {
      try { ff = await firefox.launch({ executablePath: join(cache, d, "firefox", "firefox") }); break; } catch { /* next */ }
    }
    if (!ff) console.log(`skip Firefox: Playwright's Firefox is not installed here (${String(e.message).split("\n")[0]})`);
    else console.log(`Firefox: using the cached build ${ff.version()}`);
  }
  if (ff) {
    // An older build may not speak this Playwright's protocol: then the
    // check is skipped (said so), never passed.
    let page = null;
    try { page = await ff.newPage(); } catch (e) {
      console.log(`skip Firefox: the cached build does not speak this Playwright's protocol (${String(e.message).split("\n")[0]})`);
    }
    if (page) {
      watch(page, "firefox");
      await page.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
      await page.locator(".shell").waitFor({ timeout: 120000 });
      expect("P-71 Firefox: no Save as… (no File System Access API)", !(await fileMenuItems(page)).includes("Save as…"));
      await page.setInputFiles(OPEN_INPUT, STUDY_FILE);
      await toast(page, /Opened “project-study\.json”/, 60000);
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
        page.keyboard.press("Control+s")]);
      expect("P-71 Firefox: Ctrl+S downloads the project file as before",
        !!dl && readFileSync(await dl.path(), "utf8") === await fileText(page));
    }
    await ff.close();
  }
}

// ------------------------------------------------------------ P-72 versions
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
let page = await ctx.newPage();
watch(page, "versions");
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.locator(".shell").waitFor({ timeout: 60000 });
await page.setInputFiles(OPEN_INPUT, STUDY_FILE);
await toast(page, /Opened “project-study\.json”/);
expect("P-72 the study opens with live results", await live(page));

async function saveVersion(note) {
  await fileMenu(page, "Save a version…");
  const d = page.getByRole("dialog", { name: "Save a version" });
  await d.waitFor();
  if (!note) {
    await d.getByRole("button", { name: "Save version" }).click();
    return d;
  }
  await d.getByLabel("Note").fill(note);
  await d.getByRole("button", { name: "Save version" }).click();
  return d;
}
{
  const d = await saveVersion("");
  expect("P-72 a version needs a note (shown after a submit attempt)",
    await d.getByText("Enter a note, such as “before reviewer”").isVisible());
  await d.getByLabel("Note").fill("before reviewer");
  await d.getByRole("button", { name: "Save version" }).click();
}
expect("P-72 Save a version… says it saved", await toast(page, /Saved the version “before reviewer” of “Study”/));
const v1Text = await fileText(page);
let stored = await storedVersions(page);
expect("P-72 the version holds the project file as Save project writes it, byte for byte",
  stored.length === 1 && stored[0].json === v1Text && stored[0].note === "before reviewer");
checkSchema("a saved version", JSON.parse(stored[0].json));

await excludeCell(page, "Control, row 4", "reviewer: pipetting error");
await page.waitForFunction(() => /Excluded/.test(document.querySelector(
  '.data-table input[aria-label="Control, row 4"]')?.getAttribute("title") ?? ""), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(500);
await live(page);
await saveVersion("after reviewer");
expect("P-72 the second version is saved", await toast(page, /Saved the version “after reviewer”/));
stored = await storedVersions(page);
const v2 = stored[0];
expect("P-72 the second version excludes Control row 4",
  stored.length === 2 && JSON.parse(v2.json).sheets[0].table.datasets[0].excluded?.includes("3:0"));

// close the tab; the next start reopens the session and leads to the list
await page.close();
page = await ctx.newPage();
watch(page, "versions, next start");
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
const reopened = page.locator(".toast", { hasText: /Reopened your last session, “Study”/ }).first();
expect("P-72 the next start reopens the last session and offers Open recent…",
  await reopened.waitFor({ timeout: 60000 }).then(() => true, () => false)
  && await reopened.getByRole("button", { name: "Open recent…" }).count() === 1);
await reopened.getByRole("button", { name: "Open recent…" }).click();
const recent = page.getByRole("dialog", { name: "Recent projects" });
await recent.waitFor();
const study = recent.getByRole("region", { name: "Study" });
await study.getByText("“after reviewer”").waitFor({ timeout: 10000 }).catch(() => {});
const listed = await study.innerText().catch(() => "");
expect("P-72 the list shows both versions of “Study”, newest first",
  listed.indexOf("“after reviewer”") >= 0 && listed.indexOf("“after reviewer”") < listed.indexOf("“before reviewer”"),
  listed.replace(/\s+/g, " ").slice(0, 200));
expect("P-72 the list states this browser's storage",
  /OpenDose uses .* of this browser's storage/.test(await recent.innerText()));
await study.getByRole("button", { name: "Restore the version “before reviewer” of “Study”" }).click();
expect("P-72 restoring a version says so", await toast(page, /Restored the version “before reviewer” of “Study”/));
await live(page);
{
  // savedWith names the software saving (its library versions are known
  // only once this page's engine has run), not the project: left aside.
  const bare = (t) => { const j = JSON.parse(t); delete j.savedWith; return JSON.stringify(j, null, 2); };
  const now = bare(await fileText(page));
  const v1Bare = bare(v1Text);
  let at = 0;
  while (at < now.length && now[at] === v1Bare[at]) at++;
  expect("P-72 restoring the first version gives its exact project (Save writes its bytes, savedWith aside)",
    now === v1Bare, `first difference at ${at}: ${JSON.stringify(v1Bare.slice(at - 80, at + 80))} | now ${JSON.stringify(now.slice(at - 80, at + 80))}`);
}
expect("P-72 the restored project has Control row 4 back in the analysis",
  !/Excluded/.test(await cell(page, "Control, row 4").getAttribute("title") ?? ""));

// the palette finds Open recent…
await page.keyboard.press("Control+k");
await page.getByRole("combobox", { name: "Find a command or sheet" }).fill("open recent");
expect("P-72 the palette finds Open recent…",
  await page.getByRole("option", { name: /Open recent…/ }).first().isVisible().catch(() => false));
await page.keyboard.press("Escape");

// ------------------------------------------------------------ P-73 compare
await fileMenu(page, "Compare with…");
const cmp = page.getByRole("dialog", { name: "Compare two versions" });
await cmp.waitFor();
const label = (v) => `Version “${v.note}” of “Study”, ${new Date(v.savedAt).toLocaleString()}`;
await page.evaluate(() => 0);
const vBefore = stored.find((v) => v.note === "before reviewer");
await cmp.getByLabel("Earlier").selectOption({ label: label(vBefore) });
await cmp.getByLabel("Later").selectOption({ label: label(v2) });
await cmp.getByRole("button", { name: "Compare", exact: true }).click();
const log = cmp.getByRole("region", { name: "Differences" });
await log.waitFor({ timeout: 120000 });
const logText = (await log.innerText()).replace(/\s+/g, " ");
expect("P-73 the log lists the exclusion with its value and reason",
  logText.includes("Excluded: Control, row 4: 14.1 (reviewer: pipetting error)"), logText.slice(0, 300));
const moved = cmp.getByRole("list", { name: /^Numbers that moved in / }).first();
const first = (await moved.locator("li").first().innerText().catch(() => "")).replace(/\s+/g, " ");
const [pb, pa] = arrowNumbers(first);
expect("P-73 the t test's P comes first, before and after (scipy Welch t test)",
  /\bP\b/.test(first) && near(pb, REF.before.p) && near(pa, REF.after.p),
  `${first} | reference ${REF.before.p} → ${REF.after.p}`);
expect("P-73 the summary counts the exclusion and the moved numbers",
  /1 value excluded/.test(logText) && /result numbers? moved/.test(logText));
// from the list: Compare… on a version, against the open project
await cmp.getByRole("button", { name: "Close" }).click();
await fileMenu(page, "Open recent…");
await page.getByRole("dialog", { name: "Recent projects" })
  .getByRole("button", { name: "Compare… the version “after reviewer” of “Study”" }).click();
const cmp2 = page.getByRole("dialog", { name: "Compare two versions" });
await cmp2.getByRole("button", { name: "Compare", exact: true }).click();
const log2 = (await cmp2.getByRole("region", { name: "Differences" }).innerText({ timeout: 120000 })
  .catch(() => "")).replace(/\s+/g, " ");
expect("P-73 a version against the open project (the restored first one): the exclusion is put back",
  log2.includes("Put back: Control, row 4: 14.1"), log2.slice(0, 300));
await cmp2.getByRole("button", { name: "Close" }).click();
await ctx.close();

// ------------------------------------------------------------ P-72 quota
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript(() => {
    navigator.storage.estimate = async () => ({ usage: 999_000, quota: 1_000_000 });
  });
  const p = await c.newPage();
  watch(p, "quota");
  await p.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
  await p.locator(".shell").waitFor({ timeout: 60000 });
  page = p;
  await saveVersion("too big");
  const e = p.locator('.toast[data-tone="error"]', { hasText: /Could not save the version “too big”: the version needs .* and this browser allows 1 kB more/ });
  expect("P-72 a full quota refuses the version and says how much room is left",
    await e.waitFor({ timeout: 120000 }).then(() => true, () => false));
  expect("P-72 nothing is stored when the quota is full", (await storedVersions(p)).length === 0);
  await c.close();
}

// ------------------------------------------------------------ P-74 add from project
// A colleague's file of two families (one with the open project's own
// ids, so they clash) and another digits preference: File › Add from
// project… lists the difference, keeps this project's, and adds both
// families with unique ids and working links; each computes the t test
// of e2e-fixtures/reference/compare_versions_ttest.json. Then two project
// files dropped at once are both added.
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await c.newPage();
  watch(p, "add-project");
  await p.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await p.locator(".shell").waitFor({ timeout: 60000 });
  await p.setInputFiles(OPEN_INPUT, STUDY_FILE);
  await toast(p, /Opened “project-study\.json”/);
  expect("P-74 the study opens with live results", await live(p));
  const study = JSON.parse(STUDY);
  const twin = study.sheets.map((s) => ({
    ...s, id: `${s.id}b`, name: s.name.replace("Viability", "Viability B"),
    ...(s.parentId ? { parentId: `${s.parentId}b` } : {}),
  }));
  const colleague = {
    ...study, title: "Colleague", prefs: { ...study.prefs, digits: 6 }, sheets: [...study.sheets, ...twin],
  };
  const asFile = (name, json) => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });

  const chooser = p.waitForEvent("filechooser");
  await fileMenu(p, "Add from project…");
  await (await chooser).setFiles(asFile("colleague.json", colleague));
  const d = p.getByRole("dialog", { name: "Add “colleague.json” to this project?" });
  const shown = await d.waitFor({ timeout: 15000 }).then(() => true, () => false);
  const row = shown ? (await d.getByRole("row", { name: /Significant digits in results/ }).innerText()).replace(/\s+/g, " ") : "";
  expect("P-74 a preference that differs is listed before adding, this project's kept",
    shown && /Significant digits in results 4 6/.test(row), row);
  await d.getByRole("button", { name: "Add 4 sheets" }).click();
  expect("P-74 Add from project… says what it added",
    await toast(p, /Added 2 data tables with 2 more sheets from “colleague\.json”/));
  await settled(p);
  const merged = JSON.parse(await fileText(p));
  const ids = merged.sheets.map((s) => s.id);
  const data = new Set(merged.sheets.filter((s) => s.kind === "data").map((s) => s.id));
  expect("P-74 both families are in, sheet for sheet",
    merged.sheets.length === 6 && ["Viability", "Viability (2)", "Viability B"]
      .every((n) => merged.sheets.some((s) => s.kind === "data" && s.name === n)),
    merged.sheets.map((s) => s.name).join(" | "));
  expect("P-74 every id is unique", new Set(ids).size === ids.length, ids.join(","));
  expect("P-74 every results sheet points at its own data table",
    merged.sheets.filter((s) => s.kind === "results").every((s) => data.has(s.parentId)));
  expect("P-74 the open project's preferences are kept", merged.prefs.digits === 4);
  checkSchema("a project with another project's families added", merged);
  // each added family computes the same Welch t test as the study
  for (const name of ["Viability (2)", "Viability B"]) {
    await p.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .nav-row").click();
    await p.getByRole("tab", { name: "t test" }).click();
    const pRow = p.locator(".pane-results .results-table tr", { hasText: "P value" }).first();
    const text = await pRow.innerText({ timeout: 120000 }).catch(() => "");
    const shownP = Number((text.match(/\d\.\d+/) ?? [])[0]);
    expect(`P-74 “${name}” computes its t test (P = ${REF.before.p.toPrecision(4)}, scipy)`,
      near(shownP, REF.before.p), text.replace(/\s+/g, " "));
  }
  // Undo takes the whole addition back in one step
  await p.locator(".toast", { hasText: /Added 2 data tables/ }).getByRole("button", { name: "Undo" }).click();
  await settled(p);
  expect("P-74 Undo removes everything that was added", JSON.parse(await fileText(p)).sheets.length === 2);

  // Two project files dropped on the page: both are added.
  const one = { ...study, title: "One" };
  const two = { ...study, title: "Two", sheets: twin };
  await p.evaluate(async (files) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([f.text], f.name, { type: "application/json" }));
    const at = document.querySelector("main") ?? document.body;
    at.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    at.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [{ name: "one.json", text: JSON.stringify(one) }, { name: "two.json", text: JSON.stringify(two) }]);
  expect("P-74 a drop of two project files adds the first", await toast(p, /from “one\.json”/));
  expect("P-74 ...and the second", await toast(p, /from “two\.json”/));
  await settled(p);
  const dropped = JSON.parse(await fileText(p));
  const dIds = dropped.sheets.map((s) => s.id);
  expect("P-74 after the drop: three families, unique ids, the open project's title",
    dropped.sheets.length === 6 && new Set(dIds).size === dIds.length && dropped.title === "Study",
    dropped.sheets.map((s) => `${s.id}:${s.name}`).join(" | "));
  await c.close();
}

// ------------------------------------------------------------ P-75 lab kit
// A browser set up with a template (imported through the templates
// picker), an import recipe, a plate layout, an equation, image export
// settings and 6 results digits: Preferences › Export lab kit, Forget this
// computer's data, Import lab kit…: the same lists, entry for entry. A kit
// from a newer OpenDose is refused; the templates picker hands a kit to
// the kit dialog.
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const p = await c.newPage();
  watch(p, "lab-kit");
  await p.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
  await p.locator(".shell").waitFor({ timeout: 60000 });
  await p.evaluate(() => {
    localStorage.setItem("opendose-import-recipes", JSON.stringify([{
      id: "rc-lab", name: "Lab plate reader", savedAt: "2026-11-20T09:00:00.000Z", basis: "Plain import",
      spec: { kind: "plain" },
    }]));
    localStorage.setItem("opendose-plate-layouts", JSON.stringify([{
      name: "Lab 96", format: 96, wells: { A1: { role: "blank" }, B2: { role: "sample", compound: "Drug A", conc: 1e-6 } },
      description: "Saved layout (96 wells)",
    }]));
    localStorage.setItem("opendose.userEquations.v1", JSON.stringify({ version: 1, equations: [{
      id: "eq-lab", name: "One-phase decay", text: "Y = Y0*exp(-K*X)", xIsLog: false,
      rules: { Y0: { kind: "rule", value: "1", op: "*", of: "YMAX" } }, constraints: {}, transforms: [],
    }] }));
    localStorage.setItem("opendose-export", JSON.stringify({
      format: "tiff", width: 600, height: 450, dpi: 600, unit: "mm", transparent: false, paper: true, scaleText: false,
    }));
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.locator(".shell").waitFor({ timeout: 60000 });
  // a template, through the templates picker
  const tpl = {
    opendose_template: 1,
    template: {
      name: "Lab t test", description: "Two groups, unpaired t test.", tableName: "t test", withData: true,
      table: { type: "column", datasets: [{ name: "Control", rows: [["1"], ["2"], ["3"]] }, { name: "Treated", rows: [["4"], ["5"], ["7"]] }] },
      results: [{ key: "r1", name: "t test of {table}", analysis: "column", options: { analysis: "ttest" } }],
      graphs: [], info: [],
    },
  };
  await fileMenu(p, "New data table…");
  const nd = p.getByRole("dialog", { name: "New data table" });
  await nd.getByRole("radio", { name: "From a template" }).check();
  await nd.locator('input[aria-label="Import a template file"]').setInputFiles({
    name: "lab.odtemplate.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(tpl)) });
  await nd.getByText("Imported “Lab t test”.").waitFor({ timeout: 15000 });
  await nd.getByRole("button", { name: "Cancel" }).click();
  // 6 significant digits, in Preferences
  const viewMenu = async (item) => {
    await p.locator("header").getByRole("button", { name: "View", exact: true }).click();
    await p.getByRole("menuitem", { name: item }).click();
  };
  const prefs = async () => { await viewMenu("Preferences…"); return p.getByRole("dialog", { name: "Preferences" }); };
  let pop = await prefs();
  await pop.getByLabel("Significant digits in results").selectOption("6");
  await p.keyboard.press("Escape");

  const lists = () => p.evaluate(async () => {
    const ls = (k) => JSON.parse(localStorage.getItem(k) ?? "null");
    const templates = await new Promise((resolve) => {
      const req = indexedDB.open("opendose");
      req.onsuccess = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("autosave")) { d.close(); resolve(null); return; }
        const g = d.transaction("autosave").objectStore("autosave").get("templates");
        g.onsuccess = () => { d.close(); resolve(g.result?.templates ?? null); };
        g.onerror = () => { d.close(); resolve(null); };
      };
      req.onerror = () => resolve(null);
    });
    return {
      templates, recipes: ls("opendose-import-recipes"), plateLayouts: ls("opendose-plate-layouts"),
      equations: ls("opendose.userEquations.v1")?.equations ?? null, prefs: ls("opendose-prefs"),
      exportSettings: ls("opendose-export"),
    };
  });
  const before = await lists();
  expect("P-75 the browser holds one of each before the export",
    before.templates?.length === 1 && before.recipes?.length === 1 && before.plateLayouts?.length === 1
    && before.equations?.length === 1 && before.prefs?.digits === 6 && before.exportSettings?.dpi === 600,
    JSON.stringify(before).slice(0, 300));

  pop = await prefs();
  const dl = p.waitForEvent("download");
  await pop.getByRole("button", { name: "Export lab kit" }).click();
  const download = await dl;
  const kitText = readFileSync(await download.path(), "utf8");
  const kit = JSON.parse(kitText);
  // the kit as a file to choose (Playwright deletes the download with the context)
  const kitFile = { name: "lab.odkit.json", mimeType: "application/json", buffer: Buffer.from(kitText) };
  expect("P-75 the kit file is versioned and holds every list",
    kit.opendose_lab_kit === 1 && /^opendose-lab-kit-\d{4}-\d\d-\d\d\.odkit\.json$/.test(download.suggestedFilename())
    && kit.templates.length === 1 && kit.recipes.length === 1 && kit.plateLayouts.length === 1
    && kit.equations.length === 1 && kit.preferences.digits === 6 && kit.exportSettings.dpi === 600,
    download.suggestedFilename());
  expect("P-75 Export lab kit says it downloaded on the button",
    (await pop.locator('.prefs-kit-actions .btn-swap-label[data-shown="true"]').first().innerText()
      .catch(() => "")) === "Downloaded");

  // Forget this computer's data
  await pop.getByRole("button", { name: "Forget this computer's data…" }).click();
  await Promise.all([
    p.waitForNavigation({ timeout: 30000 }),
    pop.getByRole("button", { name: "Forget and close the project" }).click(),
  ]);
  await p.locator(".shell").waitFor({ timeout: 60000 });
  const empty = await lists();
  expect("P-75 after Forget the lists are empty",
    !empty.templates?.length && !empty.recipes && !empty.plateLayouts && !empty.equations && !empty.exportSettings,
    JSON.stringify(empty).slice(0, 300));

  // a kit from a newer OpenDose is refused
  pop = await prefs();
  await pop.locator('input[aria-label="Import a lab kit file"]').setInputFiles({
    name: "future.odkit.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...kit, opendose_lab_kit: 2 })) });
  expect("P-75 a kit of a newer format is refused with what to do",
    await toast(p, /Could not import the lab kit “future\.odkit\.json”: this lab kit was made by a newer version of OpenDose \(kit format 2\); update OpenDose/));

  // Import lab kit…
  pop = await prefs();
  await pop.locator('input[aria-label="Import a lab kit file"]').setInputFiles(kitFile);
  const kd = p.getByRole("dialog", { name: "Import a lab kit" });
  await kd.waitFor({ timeout: 15000 });
  const offered = (await kd.locator(".check-row").allInnerTexts()).map((t) => t.split("\n")[0].trim());
  expect("P-75 the import dialog offers each list with its count",
    ["1 template", "1 import recipe", "1 plate layout", "1 equation", "Preferences", "Image export settings"]
      .every((x) => offered.includes(x)), offered.join(" | "));
  await kd.getByRole("button", { name: "Import" }).click();
  expect("P-75 the import says what came in",
    await toast(p, /Imported the lab kit “lab\.odkit\.json”: 1 template, 1 import recipe, 1 plate layout, 1 equation, preferences, image export settings\./));
  const after = await lists();
  for (const k of ["templates", "recipes", "plateLayouts", "equations", "prefs", "exportSettings"]) {
    expect(`P-75 after the round trip: identical ${k}`, JSON.stringify(after[k]) === JSON.stringify(before[k]),
      `${JSON.stringify(after[k]).slice(0, 160)} vs ${JSON.stringify(before[k]).slice(0, 160)}`);
  }
  // importing it again doubles nothing
  pop = await prefs();
  await pop.locator('input[aria-label="Import a lab kit file"]').setInputFiles(kitFile);
  await kd.getByRole("button", { name: "Import" }).click();
  await toast(p, /Imported the lab kit .*not doubled/);
  const again = await lists();
  expect("P-75 a second import doubles nothing",
    ["templates", "recipes", "plateLayouts", "equations"].every((k) => again[k]?.length === 1));
  // the templates picker hands a kit to the kit dialog
  await fileMenu(p, "New data table…");
  await nd.getByRole("radio", { name: "From a template" }).check();
  await nd.locator('input[aria-label="Import a template file"]').setInputFiles(kitFile);
  expect("P-75 a kit chosen in the templates picker opens the kit dialog",
    await kd.waitFor({ timeout: 15000 }).then(() => true, () => false));
  await kd.getByRole("button", { name: "Cancel" }).click();
  await c.close();
}

await browser.close();
console.log("errors:", errors.length ? errors : "none");
if (fails.length || errors.length) {
  console.error("FAILURES:", [...fails, ...errors]);
  process.exit(1);
}
console.log("project files and versions OK");
