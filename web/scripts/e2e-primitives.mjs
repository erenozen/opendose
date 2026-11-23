// End-to-end checks for the overlay primitives (components/ui): Dialog,
// Popover, Menu and Tooltip on their real call sites. Keyboard behaviour
// only: focus returns to the control that opened a layer (Escape, Cancel,
// submit, item activation), Tab stays inside an open dialog or popover,
// Home/End and type-ahead in a menu, keyboard-opened layers skip their
// entrance, and reduced motion keeps an opacity fade.
//
// Usage: node scripts/e2e-primitives.mjs http://localhost:5173/
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:5173/";
const url = (() => {
  const u = new URL(baseUrl);
  u.searchParams.set("example", "1");
  return u.toString();
})();

const browser = await chromium.launch();
const fail = [];
const errors = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};

async function openApp({ reducedMotion = "no-preference", live = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Analyze", exact: true }).waitFor({ timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector(".analyze-btn")?.disabled, null,
    { timeout: 120000 });
  // The header's status line changes while the engine boots and moves the
  // buttons under a resting pointer; hover checks wait for it to settle.
  if (live) {
    await page.locator('.pane-results[data-live="true"] .results-table').first()
      .waitFor({ timeout: 300000 });
    await page.waitForTimeout(500);
  }
  return { ctx, page };
}

// Describes the focused element: its accessible name or, failing that, its tag.
const focused = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "BODY";
  return a.getAttribute("aria-label") || a.textContent?.trim().slice(0, 60) || a.tagName;
});
const focusIs = (page, locator) => locator.evaluate((el) => el === document.activeElement);
const settle = (page, ms = 250) => page.waitForTimeout(ms);
// The header's File and View menus (DECISIONS 5).
const headerMenu = (page, name) => page.locator("header").getByRole("button", { name, exact: true });
const fileMenu = async (page, item) => {
  await headerMenu(page, "File").click();
  await page.getByRole("menuitem", { name: item }).click();
};

// ---------------------------------------------------------------- dialogs
{
  const { ctx, page } = await openApp();
  // New project… is an item of the File menu: once the menu has closed,
  // the dialog's opener is the menu's trigger.
  const newProject = headerMenu(page, "File");
  const confirm = page.getByRole("alertdialog", { name: "Start a new project?" });

  // Escape, opened from the keyboard
  await newProject.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "New project…" }).waitFor();
  await page.keyboard.press("Enter");
  await confirm.waitFor();
  expect("a keyboard-opened dialog skips its entrance (data-instant)",
    await confirm.evaluate((d) => d.hasAttribute("data-instant")));
  await page.keyboard.press("Escape");
  await settle(page);
  expect("Modal: Escape returns focus to the opener", await focusIs(page, newProject),
    await focused(page));

  // Cancel, opened with the pointer
  await fileMenu(page, "New project…");
  await confirm.waitFor();
  expect("a pointer-opened dialog animates in",
    !(await confirm.evaluate((d) => d.hasAttribute("data-instant"))));
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await settle(page);
  expect("Modal: Cancel returns focus to the opener", await focusIs(page, newProject),
    await focused(page));
  expect("the closing dialog fades out on a snapshot, then the snapshot goes",
    await page.locator(".dialog-ghost").count() === 0);

  // Tab stays inside the open dialog
  await fileMenu(page, "New data table…");
  const nt = page.locator("dialog[open]");
  await nt.waitFor();
  let outside = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press(i % 5 === 4 ? "Shift+Tab" : "Tab");
    if (!(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]")))) outside++;
  }
  expect("Tab and Shift+Tab stay inside the open dialog", outside === 0, `${outside} escapes`);
  expect("the page behind a dialog does not scroll",
    await page.evaluate(() => getComputedStyle(document.documentElement).overflow === "hidden"));

  // Submit (Enter on the primary action)
  await nt.locator("button[type=submit]").first().click();
  await settle(page, 400);
  expect("Modal: submit returns focus to the opener (or the action moved it)",
    (await focused(page)) !== "BODY", await focused(page));

  // Backdrop: a press that starts inside the dialog and ends outside does not close it
  await fileMenu(page, "New project…");
  await confirm.waitFor();
  const box = await confirm.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await settle(page);
  expect("a drag that starts inside the dialog does not close it", await confirm.isVisible());
  await page.mouse.click(5, 5);
  await settle(page);
  expect("a click on the backdrop closes it", !(await confirm.isVisible()));
  await ctx.close();
}

// ---------------------------------------------------------------- menus
{
  const { ctx, page } = await openApp();
  const analyze = page.getByRole("button", { name: "Analyze", exact: true });
  const menu = page.getByRole("menu", { name: "Add an analysis" });

  await analyze.focus();
  await page.keyboard.press("Enter");
  await menu.waitFor();
  const items = menu.getByRole("menuitem");
  const n = await items.count();
  expect("Analyze opened from the keyboard: first item focused",
    await focusIs(page, items.first()), await focused(page));
  expect("a keyboard-opened menu skips its entrance (data-instant)",
    await menu.evaluate((m) => m.hasAttribute("data-instant")));
  await page.keyboard.press("End");
  expect("End moves to the last item", await focusIs(page, items.nth(n - 1)), await focused(page));
  await page.keyboard.press("Home");
  expect("Home moves to the first item", await focusIs(page, items.first()), await focused(page));
  await page.keyboard.press("ArrowUp");
  expect("ArrowUp on the first item wraps to the last", await focusIs(page, items.nth(n - 1)));
  await page.keyboard.press("ArrowDown");
  expect("ArrowDown on the last item wraps to the first", await focusIs(page, items.first()));
  const labels = await items.evaluateAll((els) => els.map((e) =>
    (e.querySelector("span")?.textContent ?? e.textContent ?? "").trim().toLowerCase()));
  const target = labels.findIndex((l, i) => i > 0 && /^[a-z]/.test(l)
    && labels.findIndex((m) => m[0] === l[0]) === i);
  await page.keyboard.type(labels[target][0]);
  expect(`type-ahead "${labels[target][0]}" moves to "${labels[target]}"`,
    await focusIs(page, items.nth(target)), await focused(page));
  await page.keyboard.press("Home");
  await page.waitForTimeout(600); // the buffer resets after 500 ms
  // Type only once Home has landed on the first item (the same race as
  // a menu just opened), then give the last key its frame.
  await items.first().evaluate((el) => new Promise((done) => {
    const t0 = performance.now();
    const tick = () => (el === document.activeElement || performance.now() - t0 > 1000
      ? done() : requestAnimationFrame(tick));
    tick();
  }));
  await page.keyboard.type(labels[target].slice(0, 4), { delay: 30 });
  await items.nth(target).evaluate((el) => new Promise((done) => {
    const t0 = performance.now();
    const tick = () => (el === document.activeElement || performance.now() - t0 > 1000
      ? done() : requestAnimationFrame(tick));
    tick();
  }));
  expect("type-ahead matches a typed prefix",
    await focusIs(page, items.nth(target)), await focused(page));
  const tabbable = await menu.evaluate((m) => m.querySelectorAll("[tabindex='0']").length);
  expect("roving tabindex: exactly one item is in the tab order", tabbable === 1, String(tabbable));
  await page.keyboard.press("Escape");
  await settle(page);
  expect("Analyze: Escape returns focus to the button", await focusIs(page, analyze), await focused(page));
  expect("Analyze: Escape closes the menu", !(await menu.isVisible()));

  await analyze.click();
  await menu.waitFor();
  await page.keyboard.press("Tab");
  await settle(page);
  expect("Tab closes the menu", !(await menu.isVisible()));

  await analyze.click();
  await menu.waitFor();
  await menu.getByRole("menuitem", { name: /^Help me choose/ }).click();
  await page.locator("dialog[open]").first().waitFor();
  expect("an item that opens a dialog keeps focus in the dialog",
    await page.evaluate(() => !!document.activeElement?.closest("dialog[open]")), await focused(page));
  await page.keyboard.press("Escape");
  await settle(page);
  expect("closing that dialog returns focus to Analyze", await focusIs(page, analyze), await focused(page));

  await analyze.focus();
  await page.keyboard.press("Enter");
  await menu.waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await settle(page, 500);
  expect("Analyze: activating an item returns focus to the button", await focusIs(page, analyze),
    await focused(page));

  await analyze.click();
  await menu.waitFor();
  await items.nth(n - 2).click();
  await settle(page, 500);
  expect("Analyze: clicking an item returns focus to the button (after its exit)",
    await focusIs(page, analyze), await focused(page));

  // The analysis tabs: Home and End jump to the first and last tab
  const tabs = page.getByRole("tablist", { name: /^Analyses of/ }).getByRole("tab");
  const tabCount = await tabs.count();
  await page.getByRole("tab", { selected: true }).focus();
  await page.keyboard.press("End");
  await settle(page, 300);
  expect("tabs: End selects and focuses the last analysis",
    tabCount > 1 && await focusIs(page, tabs.nth(tabCount - 1))
      && (await tabs.nth(tabCount - 1).getAttribute("aria-selected")) === "true", String(tabCount));
  await page.keyboard.press("Home");
  await settle(page, 300);
  expect("tabs: Home selects and focuses the first analysis",
    await focusIs(page, tabs.first()) && (await tabs.first().getAttribute("aria-selected")) === "true");

  // SheetMenu (navigator ⋯ / right click)
  const more = page.getByRole("button", { name: "Actions for Dose response" }).first();
  await more.click();
  const sm = page.getByRole("menu", { name: "Actions for Dose response" });
  await sm.waitFor();
  expect("SheetMenu: one item is in the tab order (scrollable region is focusable)",
    await sm.evaluate((m) => m.querySelectorAll("[tabindex='0']").length === 1));
  expect("SheetMenu: the first item has focus",
    await sm.evaluate((m) => m.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  await settle(page);
  expect("SheetMenu: Escape returns focus to the sheet's row",
    await page.evaluate(() => !!document.activeElement?.closest(".nav-tree")), await focused(page));

  // The header's File menu and its right-aligned origin
  const tools = headerMenu(page, "File");
  await tools.click();
  const toolsMenu = page.locator(".sheet-menu:popover-open").first();
  await toolsMenu.waitFor();
  const origin = await toolsMenu.evaluate((m) => getComputedStyle(m).transformOrigin);
  const tb = await tools.boundingBox();
  const mb = await toolsMenu.boundingBox();
  const ox = Number.parseFloat(origin);
  expect("a right-aligned menu scales out of the corner under its trigger",
    Math.abs(mb.x + ox - (tb.x + tb.width / 2)) < tb.width, `${origin}`);
  await page.keyboard.press("Escape");
  await settle(page);
  expect("File menu: Escape returns focus to its button", await focusIs(page, tools));
  await ctx.close();
}

// ---------------------------------------------------------------- popovers
{
  const { ctx, page } = await openApp();
  await page.locator(".plot-card").first().scrollIntoViewIfNeeded();
  const options = page.locator(".plot-card").getByRole("button", { name: "Options", exact: true });
  await options.click();
  const pop = page.getByRole("dialog", { name: "Export options" });
  await pop.waitFor();
  let escapes = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(i % 7 === 6 ? "Shift+Tab" : "Tab");
    if (!(await pop.evaluate((p) => p.contains(document.activeElement)))) escapes++;
  }
  expect("Export options: Tab stays inside the open popover", escapes === 0, `${escapes} escapes`);
  await page.keyboard.press("Escape");
  await settle(page);
  expect("Export options: Escape returns focus to Options", await focusIs(page, options),
    await focused(page));
  expect("Export options: Escape closes it", !(await pop.isVisible()));

  const settings = page.locator(".plot-card").getByRole("button", { name: "Settings", exact: true });
  await settings.click();
  const gs = page.getByRole("dialog", { name: "Graph settings" });
  await gs.waitFor();
  await settle(page);
  const [top, headerBottom, scrollTop] = await page.evaluate(() => {
    const p = document.querySelector(".settings-pop");
    return [p.getBoundingClientRect().top, document.querySelector("header").getBoundingClientRect().bottom,
      p.scrollTop];
  });
  expect("Graph settings: the first rows are on screen, below the header",
    top >= headerBottom && scrollTop === 0, `${top} vs ${headerBottom}`);
  await page.mouse.click(5, 300);
  await settle(page, 400);
  expect("Graph settings: a click outside closes it", !(await gs.isVisible()));

  // Preferences: a popover opened from View, anchored to it
  const view = headerMenu(page, "View");
  await view.click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const pp = page.getByRole("dialog", { name: "Preferences" });
  await pp.waitFor();
  const [pb, vb] = [await pp.boundingBox(), await view.boundingBox()];
  expect("Preferences: placed under the View menu that opened it",
    !!pb && !!vb && pb.y >= vb.y + vb.height && pb.x + pb.width >= vb.x, JSON.stringify([pb, vb]));
  await page.keyboard.press("Escape");
  await settle(page);
  expect("Preferences: Escape returns focus to View", await focusIs(page, view), await focused(page));
  expect("Preferences: Escape closes it", !(await pp.isVisible()));
  expect("no tooltip pops up over the button that got focus back",
    await page.locator("[role=tooltip]:popover-open").count() === 0);

  // About: a dialog opened from View
  await view.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: "View" }).waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const about = page.getByRole("dialog", { name: "About OpenDose" });
  await about.waitFor();
  expect("About: the dialog holds the privacy statement",
    (await about.innerText()).includes("no data is sent anywhere"));
  await page.keyboard.press("Escape");
  await settle(page);
  expect("About: Escape returns focus to View", await focusIs(page, view), await focused(page));

  // Escape inside a popover inside a dialog closes only the popover
  // (covered by the stack; the header popovers are enough here)
  await ctx.close();
}

// ---------------------------------------------------------------- tooltips
{
  const { ctx, page } = await openApp({ live: true });
  const open = page.locator("[role=tooltip]:popover-open");
  const theme = page.getByRole("button", { name: "Collapse all" });
  const help = page.getByRole("button", { name: "Expand all" });
  await theme.hover();
  await page.waitForTimeout(150);
  const early = await open.count();
  await page.waitForTimeout(600);
  const late = await open.count();
  expect("Tooltip: waits before it opens on hover", early === 0 && late === 1, `${early}, ${late}`);
  expect("Tooltip: it names the button in words",
    /^Collapse all/.test(await open.first().innerText()), await open.first().innerText());
  await help.hover();
  await page.waitForTimeout(150);
  expect("Tooltip: the next one opens at once while warm (no second wait)",
    await open.count() === 1 && /^Expand all/.test(await open.first().innerText()));
  await page.mouse.move(700, 600);
  await page.waitForTimeout(500);
  expect("Tooltip: it closes when the pointer leaves", await open.count() === 0);
  const described = await theme.evaluate((b) => {
    const ids = (b.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    // The tooltip, or its shortcut when the tooltip repeats the name.
    return ids.length > 0 && ids.every((id) => !!document.getElementById(id)?.closest("[role=tooltip]"));
  });
  expect("Tooltip: the button is described by its tooltip (aria-describedby)", described);
  expect("Tooltip: no title attribute duplicates it",
    (await theme.getAttribute("title")) === null && (await help.getAttribute("title")) === null);
  await theme.focus();
  await page.keyboard.press("Tab");
  expect("Tooltip: keyboard focus opens it at once",
    await focusIs(page, help) && await open.count() === 1);
  await page.keyboard.press("Escape");
  expect("Tooltip: Escape closes it", await open.count() === 0);
  await ctx.close();
}

// ---------------------------------------------------------------- reduced motion
{
  const { ctx, page } = await openApp({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.__runs = [];
    document.addEventListener("transitionrun", (e) => {
      if (e.target.matches?.("dialog")) window.__runs.push(e.propertyName + e.pseudoElement);
    }, true);
  });
  await fileMenu(page, "New project…");
  const d = page.getByRole("alertdialog", { name: "Start a new project?" });
  await d.waitFor({ state: "attached" });
  // Wait for the entrance to start instead of a fixed delay: under load
  // the first transitionrun can arrive after 50 ms.
  await page.waitForFunction(() => window.__runs.length > 0, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(50);
  const props = await page.evaluate(() => window.__runs);
  expect("reduced motion: the dialog and its backdrop fade in (opacity) and do not scale",
    props.includes("opacity") && props.includes("opacity::backdrop")
      && !props.some((p) => p.startsWith("transform")), props.join(","));
  await page.waitForTimeout(300);
  await d.getByRole("button", { name: "Cancel" }).click();
  const ghost = await page.evaluate(() => {
    const g = document.querySelector(".dialog-ghost");
    if (!g) return null;
    const frames = g.getAnimations().flatMap((a) => a.effect.getKeyframes());
    return { opacity: frames.some((f) => "opacity" in f), transform: frames.some((f) => "transform" in f) };
  });
  expect("reduced motion: the dialog fades out without scaling",
    !!ghost && ghost.opacity && !ghost.transform, JSON.stringify(ghost));
  await ctx.close();
}

await browser.close();
console.log("errors:", errors.length ? errors : "none");
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("e2e OK");
