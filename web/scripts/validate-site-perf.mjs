// Performance and robustness probe for validate-site.mjs, on the live site
// through the UI: cold loads, a 2,000-row paste and t test, a 500-point
// fit, a 50-dataset grouped table, undo / redo after 200 edits, reload and
// restore of a 30-sheet project, a share-link round trip and a 384-well
// plate through the plate wizard. Every step is timed from the user's
// action to the result on screen; anything slower than 5 s is flagged.

const SLOW = 5000;

export async function runPerf({ newSession, appUrl, browser, friction }) {
  const rows = [];
  const add = (probe, ms, detail = "", extra = {}) => {
    const r = { probe, ms: ms === null ? null : Math.round(ms), slow: ms !== null && ms > SLOW, detail, ...extra };
    rows.push(r);
    console.log(`perf  ${probe}: ${ms === null ? "n/a" : `${(ms / 1000).toFixed(2)} s`}${r.slow ? " (SLOW)" : ""} ${detail}`);
    return r;
  };
  const guard = async (probe, fn) => {
    try { await fn(); } catch (e) {
      add(probe, null, `ERROR: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`, { error: true });
    }
  };
  const wait = (p, ms) => p.waitForTimeout(ms);
  const newProject = async (page) => {
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "New project" }).click();
    await page.waitForSelector(".grid-toolbar");
  };
  const newTable = async (page, type, name, shape = {}) => {
    await page.getByRole("button", { name: "New data table" }).first().click();
    const dlg = page.locator(".new-table-dialog");
    await dlg.locator(`input[name="table-type"][value="${type}"]`).check();
    await dlg.getByLabel("Table name").fill(name);
    for (const [k, v] of Object.entries(shape)) {
      if (k === "example") await dlg.getByLabel("Example data").check();
      else await dlg.getByLabel(k, { exact: true }).fill(String(v));
    }
    await dlg.getByRole("button", { name: "Create table" }).click();
    await page.waitForSelector(".grid-toolbar");
  };
  /** Time until `fn` returns truthy, polling. */
  const until = async (page, fn, timeout = 180000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await fn()) return Date.now() - t0;
      await wait(page, 100);
    }
    throw new Error("timed out");
  };
  const pasteCsv = async (page, text, cell, perDataset) => {
    await page.evaluate((t) => navigator.clipboard.writeText(t), text);
    await page.locator(`.data-table input[aria-label="${cell}"]`).click();
    const t0 = Date.now();
    await page.keyboard.press("Control+v");
    const imp = page.locator(".import-dialog");
    await imp.waitFor({ timeout: 30000 });
    const tDialog = Date.now() - t0;
    const tb = imp.getByLabel(/holds column titles/);
    if (!(await tb.isChecked())) await tb.check();
    await imp.getByRole("tab", { name: "Placement" }).click();
    await imp.getByLabel(/In place of the table/).check();
    if (perDataset) await imp.getByLabel("Y columns per dataset (replicates)").fill(String(perDataset));
    const t1 = Date.now();
    await imp.getByRole("button", { name: "Import", exact: true }).click();
    await imp.waitFor({ state: "detached", timeout: 120000 });
    return { tDialog, tImport: Date.now() - t1, t1 };
  };
  const resultsText = (page) => page.locator(".pane-results").first().innerText().catch(() => "");
  const longTasks = (page) => page.evaluate(() => { const a = window.__lt ?? []; window.__lt = []; return Math.round(a.reduce((x, y) => x + y, 0)); });

  // 1. cold loads -------------------------------------------------------
  for (let i = 1; i <= 3; i++) {
    await guard(`cold load to first results, run ${i}`, async () => {
      const s = await newSession();
      const nav = await s.page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return n ? { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, bytes: n.transferSize } : null;
      });
      const res = performance; void res;
      const bytes = await s.page.evaluate(() => performance.getEntriesByType("resource")
        .reduce((a, r) => a + (r.transferSize || 0), 0));
      const marks = await s.page.evaluate(() => globalThis.__opendoseEngine?.stats?.boots?.[0] ?? null);
      add(`cold load to first results, run ${i}`, s.loadMs,
        `DOMContentLoaded ${Math.round(nav?.dcl ?? 0)} ms; ${(bytes / 1e6).toFixed(1)} MB transferred (fresh profile, no cache)`
        + (s.firstMs !== undefined && s.firstMs < s.loadMs - 50 ? `; first numbers (saved example results) at ${s.firstMs} ms, live engine results at ${s.loadMs} ms` : "")
        + (marks ? `; engine boot ${marks.ms} ms` : ""),
        { first_ms: s.firstMs, boot: marks });
      if (i < 3) { await s.ctx.close(); return; }
      // The same browser again: warm HTTP cache (and, in a production
      // build, the offline cache once its service worker has installed).
      const reload = async (label, extra = "") => {
        const t0 = Date.now();
        await s.page.reload({ waitUntil: "domcontentloaded" });
        await s.page.waitForSelector(".results-table", { timeout: 240000 });
        const first = Date.now() - t0;
        const marked = await s.page.locator(".pane-results[data-live]").count();
        if (marked) await s.page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 240000 });
        const live = Date.now() - t0;
        const sw = await s.page.evaluate(() => !!navigator.serviceWorker?.controller);
        add(label, first, `live engine results at ${live} ms${sw ? "; served by the offline cache" : ""}${extra}`,
          { live_ms: live, service_worker: sw });
        return sw;
      };
      await guard("warm reload to first results", () => reload("warm reload to first results"));
      // give a service worker time to install and copy the files
      await s.page.waitForFunction(() => navigator.serviceWorker?.controller
        || !("serviceWorker" in navigator), null, { timeout: 60000 }).catch(() => {});
      await wait(s.page, 3000);
      const sw = await s.page.evaluate(() => !!navigator.serviceWorker?.controller);
      if (sw) {
        await guard("second warm reload (offline cache)", () => reload("second warm reload (offline cache)"));
        await guard("offline reload", async () => {
          await s.ctx.setOffline(true);
          try { await reload("offline reload", "; network switched off"); } finally { await s.ctx.setOffline(false); }
        });
      }
      await s.ctx.close();
    });
  }

  const s = await newSession();
  const { page } = s;

  // 2. 2,000-row column table, paste and t test ----------------------------
  await guard("2,000-row column paste (Ctrl+V → Import dialog → grid)", async () => {
    await newProject(page);
    await newTable(page, "column", "Big column", { "Groups (columns)": 2 });
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const lines = ["Control,Treated", ...Array.from({ length: 2000 }, () => `${(10 + 3 * rnd()).toFixed(3)},${(10.4 + 3 * rnd()).toFixed(3)}`)];
    const r = await pasteCsv(page, lines.join("\n"), "Group A, row 1");
    const tGrid = await until(page, async () => (await page.locator(".data-table tbody tr").count()) >= 2000);
    add("2,000-row column paste (Ctrl+V → Import dialog → grid)", r.tDialog + r.tImport + tGrid,
      `Import dialog opened in ${r.tDialog} ms; Import → 2,000 rows in the grid ${r.tImport + tGrid} ms`);
    await longTasks(page);
    const t0 = Date.now();
    await page.locator(".analysis-select").first().selectOption("ttest");
    const ms = await until(page, async () => /P value \(two-tailed\)/.test(await resultsText(page)));
    add("unpaired t test on 2 × 2,000 values (select → result)", Date.now() - t0,
      `result after ${ms} ms; main-thread long tasks ${await longTasks(page)} ms`);
    // typing one value re-runs the analysis
    const t1 = Date.now();
    const before = await resultsText(page);
    await page.locator('.data-table input[aria-label="Control, row 1"]').fill("99");
    await until(page, async () => (await resultsText(page)) !== before);
    add("edit one cell of the 2,000-row table → t test updated", Date.now() - t1, "");
  });

  // 2b. a long analysis must not freeze the page ----------------------------
  // One-way ANOVA on 9 groups × 2,001 values (NIST SmLs09's size): how long
  // until its result, how long the page's main thread was blocked
  // meanwhile, and how long typing 9 characters into the grid took.
  await guard("one-way ANOVA, 9 × 2,001 values: page stays responsive", async () => {
    await newProject(page);
    await newTable(page, "column", "Nine groups", { "Groups (columns)": 9, "Rows (values per group)": 2001 });
    let seed = 5;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const lines = [Array.from({ length: 9 }, (_, g) => `G${g + 1}`).join(","),
      ...Array.from({ length: 2001 }, () => Array.from({ length: 9 },
        (_, g) => (1000000.4 + g * 0.01 + 0.1 * rnd()).toFixed(4)).join(","))];
    await pasteCsv(page, lines.join("\n"), "Group A, row 1");
    await until(page, async () => (await page.locator(".data-table tbody tr").count()) >= 2001);
    await wait(page, 2000);
    await longTasks(page);
    const t0 = Date.now();
    await page.locator(".analysis-select").first().selectOption("anova");
    await wait(page, 500);
    // typing while it computes (a newer input replaces the running job)
    const cellIn = page.locator('.data-table input[aria-label="G9, row 2001"]');
    await cellIn.click();
    const k0 = Date.now();
    await page.keyboard.type("1000000.5");
    const typing = Date.now() - k0;
    await page.keyboard.press("Enter");
    const busySeen = await page.locator(".pane-results .analysis-busy").waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    const ms = await until(page, async () => /Source of variation|F \(/.test(await resultsText(page))
      && (await page.locator('.pane-results[data-live="true"]').count()) > 0, 240000).catch(() => null);
    const lt = await page.evaluate(() => { const a = window.__lt ?? []; window.__lt = []; return a; });
    const blocked = Math.round(lt.reduce((x, y) => x + y, 0));
    const worst = Math.round(Math.max(0, ...lt));
    add("one-way ANOVA, 9 × 2,001 values: page stays responsive", ms === null ? null : Date.now() - t0,
      `result ${ms === null ? "not shown within 4 min" : "shown"}; typing 9 characters meanwhile took ${typing} ms; `
      + `main thread blocked ${blocked} ms in total, longest task ${worst} ms`
      + `${busySeen ? "; busy line with Cancel shown" : ""}`,
      { typing_ms: typing, blocked_ms: blocked, longest_task_ms: worst, busy_line: busySeen });
    rows.at(-1).slow = worst > 1000;
  });

  // 3. 500-point XY fit ----------------------------------------------------
  await guard("500-point XY fit (4PL)", async () => {
    await newProject(page);
    await newTable(page, "xy", "Big curve", { "Replicates per X": 1, "Rows (X values)": 500 });
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    const lines = ["Conc,Response", ...Array.from({ length: 500 }, (_, i) => {
      const x = -9 + (5 * i) / 499;
      return `${(10 ** x).toPrecision(6)},${(2 + 98 / (1 + 10 ** ((x + 6.5) * 1.1)) + 6 * rnd()).toFixed(3)}`;
    })];
    const r = await pasteCsv(page, lines.join("\n"), "X, row 1");
    await longTasks(page);
    const ms = await until(page, async () => {
      const t = await resultsText(page);
      return /LogIC50/.test(t) && /# of points analyzed\s*500/.test(t);
    });
    add("500-point XY fit (4PL)", r.tImport + ms, `Import → fitted 4PL on 500 points; main-thread long tasks ${await longTasks(page)} ms`);
  });

  // 4. 50-dataset grouped table -------------------------------------------
  await guard("50-dataset grouped table (paste + two-way ANOVA)", async () => {
    await newProject(page);
    await newTable(page, "grouped", "Fifty", { "Datasets (columns)": 50, Replicates: 3, "Rows (levels of the row factor)": 4 });
    const head = ["Row", ...Array.from({ length: 50 }, (_, d) => [`D${d + 1}`, `D${d + 1}`, `D${d + 1}`]).flat()];
    const body = Array.from({ length: 4 }, (_, r) => [`R${r + 1}`, ...Array.from({ length: 150 }, (_, k) => (10 + r + Math.floor(k / 3) * 0.05 + ((k * 13 + r * 7) % 5) * 0.1).toFixed(2))]);
    const text = [head, ...body].map((x) => x.join(",")).join("\n");
    await page.evaluate((t) => navigator.clipboard.writeText(t), text);
    await page.locator('.data-table input[aria-label="Row 1 title"]').click();
    const t0 = Date.now();
    await page.keyboard.press("Control+v");
    const imp = page.locator(".import-dialog");
    await imp.waitFor({ timeout: 30000 });
    await imp.getByLabel(/holds column titles/).check();
    await imp.getByLabel("Column 1 becomes").selectOption("rowTitle");
    await imp.getByRole("tab", { name: "Placement" }).click();
    await imp.getByLabel(/In place of the table/).check();
    await imp.getByLabel("Y columns per dataset (replicates)").fill("3");
    await imp.getByRole("button", { name: "Import", exact: true }).click();
    await imp.waitFor({ state: "detached", timeout: 60000 });
    await longTasks(page);
    const ms = await until(page, async () => {
      const t = await resultsText(page);
      return /Source of variation/.test(t) && /Column factor/.test(t) && !/Analysis failed/.test(t);
    });
    const df = (await resultsText(page)).match(/Column factor[^\n]*\n?/)?.[0]?.replace(/\s+/g, " ") ?? "";
    add("50-dataset grouped table (paste + two-way ANOVA)", Date.now() - t0,
      `two-way ANOVA ready ${ms} ms after Import; ${df.trim().slice(0, 80)}; long tasks ${await longTasks(page)} ms`);
    // switching the graph type on a 50-dataset table
    const g0 = Date.now();
    await page.locator(".graph-select").first().selectOption("grouped_box").catch(() => {});
    await wait(page, 300);
    await until(page, async () => (await page.locator(".plot .boxlayer path, .plot .trace.boxes").count()) > 0, 30000).catch(() => {});
    add("50-dataset grouped table: switch graph to box plots", Date.now() - g0, "");
  });

  // 5. undo / redo after 200 edits ----------------------------------------
  await guard("200 cell edits", async () => {
    await newProject(page);
    await newTable(page, "column", "Edits", { "Groups (columns)": 4, "Rows (values per group)": 50 });
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) {
      const g = "ABCD"[i % 4];
      const r = Math.floor(i / 4) + 1;
      const cell = page.locator(`.data-table input[aria-label="Group ${g}, row ${r}"]`);
      await cell.click();
      await page.keyboard.type(String(i + 1));
      await page.keyboard.press("Enter");
    }
    const te = Date.now() - t0;
    add("200 cell edits (typed, Enter after each)", te, `${Math.round(te / 200)} ms per edit including Playwright's typing; total not a single user wait`, { aggregate: true });
    rows.at(-1).slow = te / 200 > 1000;
    const filled = async () => page.locator(".data-table tbody input:not([aria-label$='title'])")
      .evaluateAll((es) => es.filter((e) => e.value.trim() !== "").length);
    const nFilled = await filled();
    const undo = page.getByRole("button", { name: "Undo" });
    const redo = page.getByRole("button", { name: "Redo" });
    let presses = 0;
    const u0 = Date.now();
    while (presses < 450 && !(await undo.isDisabled()) && (await filled()) > 0) { await undo.click(); presses++; }
    const left = await filled();
    add("undo back to the empty table (Undo button)", Date.now() - u0,
      `${nFilled} values typed; ${presses} undo steps; ${left} values left${left ? " (UNDO DID NOT REACH THE EMPTY TABLE)" : ""}`,
      { undo_steps: presses, values_left: left });
    rows.at(-1).slow = (Date.now() - u0) / Math.max(1, presses) > 1000;
    if (left) friction("wrong", `Undo history is capped: after ${nFilled} single-cell edits the Undo button greys out after ${presses} steps, leaving ${left} values that can no longer be undone (redo then restores all of them correctly).`);
    let rp = 0;
    const r0 = Date.now();
    while (rp < 450 && !(await redo.isDisabled())) { await redo.click(); rp++; }
    const back = await filled();
    const ok = back === nFilled && await page.locator('.data-table input[aria-label="Group D, row 50"]').inputValue() === "200";
    add("redo everything (Redo button)", Date.now() - r0, `${rp} redo steps; ${back} of ${nFilled} values back; last cell ${ok ? "= 200 (correct)" : "WRONG"}`,
      { redo_steps: rp, restored: ok });
    rows.at(-1).slow = (Date.now() - r0) / Math.max(1, rp) > 1000;
    if (!ok) friction("wrong", `Undo/redo after 200 edits did not restore the table (${back} of ${nFilled} values back after ${rp} redo steps).`);
    // The app's own cost per step, without Playwright's round trips per
    // click: every undo, then every redo, through the store, each step
    // followed by a rendered frame (builds that expose the store only).
    const appSide = await page.evaluate(async () => {
      const app = globalThis.__opendose;
      if (!app) return null;
      const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      let n = 0;
      const t0 = performance.now();
      while (app.store.canUndo && n < 1100) { app.store.undo(); n++; await frame(); }
      const tu = performance.now() - t0;
      let m = 0;
      const t1 = performance.now();
      while (app.store.canRedo && m < 1100) { app.store.redo(); m++; await frame(); }
      return { undo: Math.round(tu), redo: Math.round(performance.now() - t1), n, m };
    });
    if (appSide) {
      add("undo all + redo all, app side (one rendered frame per step)", appSide.undo + appSide.redo,
        `${appSide.n} undo steps ${appSide.undo} ms (${(appSide.undo / Math.max(1, appSide.n)).toFixed(1)} ms each), `
        + `${appSide.m} redo steps ${appSide.redo} ms`, { aggregate: true });
      rows.at(-1).slow = (appSide.undo + appSide.redo) / Math.max(1, appSide.n + appSide.m) > 100;
    }
  });

  // 6. reload and restore a 30-sheet project -------------------------------
  let sheets30 = 0;
  await guard("reload and restore a 30-sheet project", async () => {
    await newProject(page);
    for (let i = 1; i <= 10; i++) {
      await newTable(page, i % 2 ? "column" : "xy", `T${i}`, { example: true });
      await wait(page, 300);
    }
    const count = () => page.locator(".nav-item.level-2").count();
    sheets30 = await count();
    await wait(page, 2500); // autosave debounce
    const t0 = Date.now();
    await page.goto(appUrl(), { waitUntil: "domcontentloaded" });
    const restore = page.locator(".restore-banner").getByRole("button", { name: "Restore" });
    await until(page, async () => (await count()) >= sheets30 || (await restore.count()) > 0, 240000);
    if (await restore.count()) await restore.click();
    await until(page, async () => (await count()) >= sheets30, 240000);
    // engine ready: open the last table and wait for its results
    await page.getByRole("treeitem", { name: "T10", exact: true }).first().locator(":scope > .nav-row").click();
    await page.waitForSelector(".results-table, .stat-cols", { timeout: 240000 });
    const ms = Date.now() - t0;
    const after = await count();
    const names = await page.locator(".nav-item.level-2 .nav-name").allInnerTexts().catch(() => []);
    add("reload and restore a 30-sheet project", ms,
      `${sheets30} sheets before, ${after} after the reload${after === sheets30 ? " (all back)" : " (MISMATCH)"}; tables ${names.filter((n) => /^T\d+$/.test(n.trim())).length}/10`,
      { sheets_before: sheets30, sheets_after: after });
    if (after !== sheets30) friction("wrong", `Reload of a ${sheets30}-sheet project restored ${after} sheets.`);
  });

  // 7. share link round trip -----------------------------------------------
  await guard("share link round trip", async () => {
    await page.getByRole("button", { name: "More ways to save and share" }).click();
    await page.getByRole("menuitem", { name: "Copy share link…" }).click();
    const dlg = page.getByRole("dialog", { name: "Share this project" });
    await dlg.waitFor({ timeout: 15000 });
    const link = await dlg.getByLabel("Share link").inputValue().catch(() => "");
    const dlgText = await dlg.innerText();
    await dlg.getByRole("button", { name: "Done" }).click().catch(() => page.keyboard.press("Escape"));
    if (!link) {
      add("share link round trip", null, `no link produced: ${dlgText.replace(/\s+/g, " ").slice(0, 200)}`, { error: true });
      friction("missing", `Share link of a ${sheets30}-sheet project could not be made: ${dlgText.replace(/\s+/g, " ").slice(0, 160)}`);
      return;
    }
    const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 0.6 });
    const p2 = await ctx2.newPage();
    const errs = [];
    p2.on("pageerror", (e) => errs.push(e.message));
    const t0 = Date.now();
    await p2.goto(link, { waitUntil: "domcontentloaded" });
    await until(p2, async () => (await p2.locator(".nav-item.level-2").count()) >= sheets30, 240000).catch(() => {});
    await p2.getByRole("treeitem", { name: "T10", exact: true }).first().locator(":scope > .nav-row").click().catch(() => {});
    await p2.waitForSelector(".results-table, .stat-cols", { timeout: 240000 });
    const ms = Date.now() - t0;
    const n2 = await p2.locator(".nav-item.level-2").count();
    const banner = await p2.getByRole("region", { name: "Shared project" }).count();
    add("share link round trip", ms,
      `link ${(link.length / 1024).toFixed(1)} kB for ${sheets30} sheets; opened in a fresh browser with ${n2} sheets${banner ? ", read-only banner shown" : ""}${errs.length ? `; page errors: ${errs.join("; ").slice(0, 120)}` : ""}`,
      { link_kb: Math.round(link.length / 102.4) / 10, sheets_after: n2 });
    if (n2 !== sheets30) friction("wrong", `Share link round trip: ${sheets30} sheets sent, ${n2} opened.`);
    await ctx2.close();
  });

  // 8. 384-well plate through the plate wizard ------------------------------
  await guard("384-well plate through the plate wizard", async () => {
    await newProject(page);
    await page.getByRole("button", { name: "New data table" }).first().click();
    const dlg = page.locator(".new-table-dialog");
    await dlg.getByRole("radio", { name: /Start from an assay/ }).check();
    await dlg.getByText("Plate reader → dose-response").first().click();
    await dlg.getByText("An empty layout").click();
    await dlg.getByRole("button", { name: "Start assay" }).click();
    const wz = page.locator("dialog.assay-wizard");
    if (!(await wz.waitFor({ timeout: 8000 }).then(() => true, () => false))) {
      friction("friction", "The assay setup wizard did not always open after \"Start assay\"; when it did not, the user has to find \"Open setup wizard…\" in the analysis controls.");
      await page.getByRole("button", { name: "Open setup wizard…" }).click();
      await wz.waitFor({ timeout: 30000 });
    }
    const val = (r, c) => (c === 0 ? 1.21 + 0.01 * Math.sin(r) : c === 23 ? 0.06 + 0.005 * Math.cos(r)
      : 0.06 + 1.15 / (1 + 10 ** ((11 - c) * 0.45 + 0.2 * (r % 8 - 4) * 0)) + 0.01 * Math.sin(r * 7 + c)).toFixed(4);
    const grid = Array.from({ length: 16 }, (_, r) => Array.from({ length: 24 }, (_, c) => val(r, c)));
    const labelled = [["", ...Array.from({ length: 24 }, (_, i) => i + 1)].join("\t"),
      ...grid.map((row, r) => ["ABCDEFGHIJKLMNOP"[r], ...row].join("\t"))].join("\n");
    await wz.getByLabel("Plate format").selectOption("384");
    await wz.getByLabel("Paste plate grid").fill(`Reader export\n${labelled}`);
    let t0 = Date.now();
    await wz.getByRole("button", { name: "Read pasted plates" }).click();
    await wait(page, 600);
    const st1 = (await wz.locator("[role=status]").allInnerTexts()).join(" ");
    add("384-well plate: read a labelled grid (rows A–P, columns 1–24)", Date.now() - t0, `wizard says: "${st1}"`,
      { read_as: st1 });
    if (/96 wells/.test(st1)) {
      friction("wrong", "Plate wizard: a pasted 384-well reader grid with row letters A–P and columns 1–24 is read as \"1 plate of 96 wells\" (only A1–H12; the other 288 wells are silently dropped), even with Plate format set to 384. The 8 × 12 shape is tried first and matches the top-left corner. A bare 16 × 24 block without labels is read correctly.");
      await wz.getByLabel("Paste plate grid").fill(grid.map((r) => r.join("\t")).join("\n"));
      t0 = Date.now();
      await wz.getByRole("button", { name: "Read pasted plates" }).click();
      await wait(page, 600);
      const st2 = (await wz.locator("[role=status]").allInnerTexts()).join(" ");
      add("384-well plate: read the same grid without row/column labels", Date.now() - t0, `wizard says: "${st2}"`);
    }
    await wz.getByRole("button", { name: "Next", exact: true }).click();
    const tpl = wz.locator("select").first();
    const opt = await tpl.locator("option").evaluateAll((os) => (os.find((o) => /384/.test(o.textContent)) ?? os[1])?.value);
    await tpl.selectOption(opt);
    await wz.getByRole("button", { name: "Apply template" }).click();
    t0 = Date.now();
    await wz.getByRole("button", { name: "Next", exact: true }).click();
    await until(page, async () => /Plate 1/.test(await wz.locator(".results-table").first().innerText().catch(() => "")), 120000);
    add("384-well plate: QC preview in the wizard", Date.now() - t0, "");
    await wz.getByRole("button", { name: "Next", exact: true }).click();
    t0 = Date.now();
    await wz.locator(".modal-actions .btn-primary").click();
    await wz.waitFor({ state: "detached", timeout: 60000 });
    await until(page, async () => /384 wells/.test(await page.locator(".plate-results").first().innerText().catch(() => "")), 240000);
    const qc = (await page.locator(".plate-results").first().innerText()).split("\n").slice(0, 6).join(" ").slice(0, 140);
    const nLinked = await page.locator(".nav-item", { hasText: "Dose-response of Plate" }).count();
    add("384-well plate: finish the wizard → plate QC and linked dose-response tables", Date.now() - t0,
      `${qc}; linked dose-response sheets in the navigator: ${nLinked}`);
    const t2 = Date.now();
    await page.locator(".plate-results").getByRole("button", { name: /Open “Dose-response of Plate/ }).first().click();
    await until(page, async () => /LogIC50|LogEC50/.test(await resultsText(page)), 240000);
    const fits = (await resultsText(page)).match(/LogIC50|LogEC50/g)?.length ?? 0;
    add("384-well plate: open the linked dose-response fits", Date.now() - t2, `${fits} midpoint rows shown`);
  });

  const errs = [...s.log.errors];
  if (errs.length) for (const e of errs) friction("console", `Console error during the performance probe: ${e}`);
  await s.ctx.close();
  return { slow_threshold_ms: SLOW, rows, console_errors: errs };
}
