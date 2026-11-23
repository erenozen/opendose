// End-to-end checks for motion (docs/design/motion.md): what runs, on
// which property, for how long and on which curve, read from
// document.getAnimations() and transitionrun events on the real app.
// - layers enter on --dur-enter / --ease-out and leave on --dur-exit,
//   scaling from their trigger; the drawer and its scrim share --ease-drawer
//   and close faster than they open;
// - a glide (segmented thumb, tour ring and card) follows a pointer press
//   only; keyboard opens, switches and steps start nothing;
// - press feedback scales buttons and spares data-still containers;
// - the theme toggle starts no transition;
// - reduced motion keeps the fades and drops every transform and glide.
//
// Usage: node scripts/e2e-motion.mjs http://localhost:5173/ [--frames <dir>]
// --frames saves mid-flight screenshots, slowed to a tenth with CDP
// Animation.setPlaybackRate.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:5173/";
const framesAt = process.argv.indexOf("--frames");
const FRAMES = framesAt > 0 ? process.argv[framesAt + 1] : null;
if (FRAMES) mkdirSync(FRAMES, { recursive: true });
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

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";

async function openApp({ width = 1400, height = 900, reducedMotion = "no-preference" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  // Every transition that starts, from the first paint on.
  await page.addInitScript(() => {
    window.__runs = [];
    document.addEventListener("transitionrun", (e) => {
      const t = e.target;
      window.__runs.push({ cls: String(t.className?.baseVal ?? t.className ?? t.tagName),
        prop: e.propertyName, pseudo: e.pseudoElement });
    }, true);
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator('.pane-results[data-live="true"] .results-table').first()
    .waitFor({ timeout: 300000 });
  await page.waitForTimeout(500);
  return { ctx, page };
}

/** The transitions that started since the last call, then forget them. */
const runs = (page, re) => page.evaluate((src) => {
  const all = window.__runs;
  window.__runs = [];
  return all.filter((r) => new RegExp(src).test(r.cls));
}, re.source);

/** Animations running on elements matching `sel`: property, duration, curve. */
const running = (page, sel) => page.evaluate((s) => document.getAnimations()
  .filter((a) => a.effect?.target?.matches?.(s))
  .map((a) => {
    const t = a.effect.getTiming();
    const props = a.transitionProperty ? [a.transitionProperty]
      : [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))]
        .filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k));
    return { props, duration: Math.round(Number(t.duration)), easing: t.easing };
  }), sel);

/** Waits until something animates on `sel` (up to 2 s), then reports it. */
async function caught(page, sel) {
  await page.waitForFunction((s) => document.getAnimations()
    .some((a) => a.effect?.target?.matches?.(s)), sel, { timeout: 2000 }).catch(() => {});
  return running(page, sel);
}
const props = (list) => list.flatMap((a) => a.props).sort().join(",");
const all = (list, f) => list.length > 0 && list.every(f);
const describe = (list) => JSON.stringify(list);

async function frame(page, ctx, name, act, at = 600) {
  if (!FRAMES) { await act(); return; }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
  await act();
  await page.waitForTimeout(at);
  await page.screenshot({ path: `${FRAMES}/${name}.png` });
  await page.waitForTimeout(2600);
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  await cdp.detach();
}

const header = (page, name) => page.locator("header").getByRole("button", { name, exact: true });
async function viewMenu(page, item) {
  await header(page, "View").click();
  await page.getByRole("menuitem", { name: item }).click();
}

// ---------------------------------------------------------------- desktop
{
  const { ctx, page } = await openApp();

  // Segmented thumb (plan 001)
  expect("thumb: nothing glides on first paint", (await runs(page, /seg-thumb/)).length === 0);
  await header(page, "Analyze").click();
  await page.getByRole("menuitem", { name: /^Linear regression/ }).click();
  await page.locator(".mode-switch [role=tab]").nth(1).waitFor();
  await page.waitForTimeout(400);
  expect("thumb: a new analysis moves it at once", (await runs(page, /seg-thumb/)).length === 0);
  const tabs = page.locator(".mode-switch [role=tab]");
  await tabs.nth(0).click();
  const glide = await caught(page, ".seg-thumb-fill");
  expect("thumb: a pointer press on a tab glides it on clip-path, 200 ms, --ease-in-out",
    all(glide, (a) => a.props[0] === "clip-path" && a.duration === 200 && a.easing === EASE_IN_OUT),
    describe(glide));
  await page.waitForTimeout(400);
  await runs(page, /./);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  expect("thumb: an arrow key moves it at once", (await runs(page, /seg-thumb/)).length === 0);
  await frame(page, ctx, "thumb-glide", () => tabs.nth(0).click());

  // Press feedback (plan 004)
  const analyze = header(page, "Analyze");
  const box = await analyze.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const press = await caught(page, ".analyze-btn");
  await page.mouse.up();
  expect("press: a button scales on press, transform 160 ms --ease-out",
    press.some((a) => a.props[0] === "transform" && a.duration === 160 && a.easing === EASE_OUT),
    describe(press));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Menu: origin, entrance, exit, keyboard (plans 006, 009, 002)
  await header(page, "File").click();
  const menu = page.getByRole("menu");
  const enter = await caught(page, "[role=menu]");
  expect("menu: enters on opacity and transform, 200 ms --ease-out",
    props(enter) === "opacity,transform" && all(enter, (a) => a.duration === 200 && a.easing === EASE_OUT),
    describe(enter));
  const origin = await menu.evaluate((m) => ({
    css: getComputedStyle(m).transformOrigin, ui: m.style.getPropertyValue("--ui-origin"),
    width: m.offsetWidth,
  }));
  expect("menu: scales from its trigger (--ui-origin), not from its centre",
    origin.ui !== "" && origin.css === origin.ui && !origin.css.startsWith(`${origin.width / 2}px`),
    JSON.stringify(origin));
  await page.waitForTimeout(300);
  await page.mouse.click(700, 600);
  const exit = await caught(page, "[role=menu]");
  expect("menu: a pointer close leaves on 150 ms",
    all(exit, (a) => a.duration === 150), describe(exit));
  await page.waitForTimeout(400);
  await header(page, "File").focus();
  await page.keyboard.press("Enter");
  await menu.waitFor();
  await page.waitForTimeout(30);
  expect("menu: a keyboard open runs nothing", (await running(page, "[role=menu]")).length === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(30);
  expect("menu: Escape removes it at once", await menu.count() === 0);
  await frame(page, ctx, "menu-enter", () => header(page, "File").click(), 700);
  await page.keyboard.press("Escape");

  // Dialog: entrance with its backdrop, exit, keyboard palette (plans 008, 002)
  await header(page, "File").click();
  await page.getByRole("menuitem", { name: "New project…" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Start a new project?" });
  await confirm.waitFor();
  const din = await caught(page, "dialog.modal");
  expect("dialog: enters on opacity and transform with its backdrop, 200 ms --ease-out",
    props(din).includes("opacity") && props(din).includes("transform")
      && all(din, (a) => a.duration === 200 && a.easing === EASE_OUT), describe(din));
  await page.waitForTimeout(300);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  const dout = await caught(page, ".dialog-ghost, .dialog-ghost-backdrop");
  expect("dialog: a pointer close fades its snapshot and backdrop out, 150 ms",
    props(dout).includes("opacity") && props(dout).includes("transform")
      && all(dout, (a) => a.duration === 150), describe(dout));
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await palette.waitFor();
  await page.waitForTimeout(30);
  expect("palette: Ctrl+K opens it with no motion", (await running(page, "dialog.modal")).length === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await frame(page, ctx, "dialog-enter", async () => {
    await header(page, "File").click();
    await page.getByRole("menuitem", { name: "New project…" }).click();
  }, 900);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(400);

  // Navigator twisty (plan 013)
  const section = page.getByRole("treeitem", { name: /^Data tables/ }).first();
  await section.focus();
  await runs(page, /./);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  expect("navigator: folding by arrow key turns the twisty at once",
    (await runs(page, /twisty/)).length === 0);

  // Theme (plan 005): the swap starts no transition
  await viewMenu(page, "Preferences…");
  const theme = page.getByRole("combobox", { name: "Theme" });
  await theme.waitFor();
  await page.waitForTimeout(300);
  await runs(page, /./);
  await theme.selectOption("dark");
  await page.waitForTimeout(300);
  const themeRuns = await runs(page, /./);
  expect("theme: switching to dark starts no transition", themeRuns.length === 0,
    themeRuns.slice(0, 5).map((r) => `${r.cls}:${r.prop}`).join(" "));
  await theme.selectOption("light");
  await page.waitForTimeout(300);
  expect("theme: switching back starts none either", (await runs(page, /./)).length === 0);
  expect("theme: the no-transitions guard is gone after the swap",
    !(await page.evaluate(() => document.documentElement.classList.contains("no-transitions"))));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Help panel (plan 011)
  const help = page.getByRole("complementary", { name: "Help" });
  await viewMenu(page, "Help and tour");
  await help.waitFor();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Close help" }).click();
  const hout = await caught(page, ".help-panel");
  expect("help: a pointer close slides it out, opacity and transform, 150 ms --ease-out",
    props(hout) === "opacity,transform" && all(hout, (a) => a.duration === 150 && a.easing === EASE_OUT),
    describe(hout));
  await page.waitForTimeout(400);
  expect("help: unmounted after its exit", await page.locator(".help-panel").count() === 0);
  await page.keyboard.press("Control+/");
  await help.waitFor();
  await page.waitForTimeout(30);
  expect("help: Ctrl+/ opens it with no motion", (await running(page, ".help-panel")).length === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(30);
  expect("help: Escape removes it at once", await page.locator(".help-panel").count() === 0);

  // Tour (plan 010)
  await viewMenu(page, "Help and tour");
  await help.getByRole("button", { name: "Take the tour" }).click();
  await page.locator(".tour-card").waitFor();
  await page.waitForTimeout(500);
  await page.locator(".tour-next").click();
  const tglide = await caught(page, ".tour-dim, .tour-ring, .tour-card");
  expect("tour: a pointer Next glides dim and ring (clip-path) and card (transform), 200 ms --ease-in-out",
    props(tglide) === "clip-path,clip-path,transform"
      && all(tglide, (a) => a.duration === 200 && a.easing === EASE_IN_OUT), describe(tglide));
  await page.waitForTimeout(400);
  await page.locator(".tour-next").focus();
  await page.keyboard.press("Enter");
  await page.locator('.tour[data-step="3"]').waitFor();
  await page.waitForTimeout(30);
  expect("tour: Next from the keyboard jumps",
    (await running(page, ".tour-dim, .tour-ring, .tour-card")).length === 0);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);
  expect("tour: the ring follows a scroll at once",
    (await running(page, ".tour-dim, .tour-ring")).length === 0);
  await frame(page, ctx, "tour-glide", () => page.locator(".tour-next").click(), 900);
  await page.getByRole("button", { name: "Skip tour" }).click();

  await ctx.close();
}

// ---------------------------------------------------------------- phone drawer (plan 007)
{
  const { ctx, page } = await openApp({ width: 390, height: 844 });
  const toggle = page.getByRole("button", { name: "Show or hide the sheet navigator" });
  await toggle.click();
  const open = await caught(page, ".navigator, .nav-scrim");
  expect("drawer: opens with its scrim on one curve, 260 ms --ease-drawer",
    props(open) === "opacity,transform"
      && all(open, (a) => a.duration === 260 && a.easing === EASE_DRAWER), describe(open));
  await page.waitForTimeout(500);
  await page.mouse.click(370, 400);
  const close = (await caught(page, ".navigator, .nav-scrim")).filter((a) => a.props[0] !== "visibility");
  expect("drawer: closes with its scrim faster, 200 ms --ease-drawer",
    props(close) === "opacity,transform"
      && all(close, (a) => a.duration === 200 && a.easing === EASE_DRAWER), describe(close));
  await page.waitForTimeout(500);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(30);
  expect("drawer: Enter on the toggle opens it at once",
    (await running(page, ".navigator, .nav-scrim")).length === 0
      && await page.locator(".navigator.drawer-open").count() === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(30);
  expect("drawer: Escape closes it at once", (await running(page, ".navigator, .nav-scrim")).length === 0);
  await page.waitForTimeout(300);
  await frame(page, ctx, "drawer-open", () => toggle.click(), 800);
  await ctx.close();
}

// ---------------------------------------------------------------- reduced motion
{
  const { ctx, page } = await openApp({ reducedMotion: "reduce" });
  await header(page, "File").click();
  const menu = await caught(page, "[role=menu]");
  expect("reduced: a menu fades in without scaling, 150 ms",
    props(menu) === "opacity" && all(menu, (a) => a.duration === 150), describe(menu));
  await page.keyboard.press("Escape");
  await header(page, "Analyze").click();
  await page.getByRole("menuitem", { name: /^Linear regression/ }).click();
  await page.locator(".mode-switch [role=tab]").nth(1).waitFor();
  await page.waitForTimeout(300);
  await runs(page, /./);
  await page.locator(".mode-switch [role=tab]").nth(0).click();
  await page.waitForTimeout(300);
  expect("reduced: the thumb jumps", !(await runs(page, /seg-thumb/)).some((r) => r.prop === "clip-path"));
  const analyze = header(page, "Analyze");
  const box = await analyze.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(30);
  const press = await running(page, ".analyze-btn");
  await page.mouse.up();
  expect("reduced: no press scale", !press.some((a) => a.props[0] === "transform"), describe(press));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await viewMenu(page, "Help and tour");
  const help = page.getByRole("complementary", { name: "Help" });
  await help.waitFor();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Close help" }).click();
  const hout = await caught(page, ".help-panel");
  expect("reduced: the help panel fades out without sliding, 120 ms",
    props(hout) === "opacity" && all(hout, (a) => a.duration === 120), describe(hout));
  await page.waitForTimeout(400);

  await viewMenu(page, "Help and tour");
  await help.getByRole("button", { name: "Take the tour" }).click();
  await page.locator(".tour-card").waitFor();
  await page.waitForTimeout(500);
  await page.locator(".tour-next").click();
  await page.waitForTimeout(30);
  expect("reduced: a pointer Next in the tour jumps",
    (await running(page, ".tour-dim, .tour-ring, .tour-card")).length === 0);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await ctx.close();

  const phone = await openApp({ width: 390, height: 844, reducedMotion: "reduce" });
  await phone.page.getByRole("button", { name: "Show or hide the sheet navigator" }).click();
  // (visibility rides along: it keeps the drawer shown while it fades)
  const drawer = (await caught(phone.page, ".navigator, .nav-scrim"))
    .filter((a) => a.props[0] !== "visibility");
  expect("reduced: the drawer fades in place with its scrim, no slide",
    props(drawer) === "opacity,opacity" && all(drawer, (a) => a.duration === 150), describe(drawer));
  await phone.ctx.close();
}

await browser.close();
console.log("errors:", errors.length ? errors : "none");
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("e2e OK");
