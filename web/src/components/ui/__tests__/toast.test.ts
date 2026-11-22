// Toast queue: duration by length, the three-toast limit, pausing, and
// progress toasts resolving in place. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXIT_MS, MAX_VISIBLE, ToastStore, inferTone, toastDuration,
} from "../Toast.store.ts";

/** A clock the test moves by hand. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    clock: {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => { timers.set(++seq, { at: now + ms, fn }); return seq; },
      clearTimeout: (h: unknown) => { timers.delete(h as number); },
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

test("duration: at least 4 s, else words at 200 wpm plus 1 s", () => {
  assert.equal(toastDuration("Saved."), 4000);
  assert.equal(toastDuration(""), 4000);
  // 20 words: 6 s of reading + 1 s
  assert.equal(toastDuration(Array(20).fill("word").join(" ")), 7000);
  // 50 words: 15 s + 1 s
  assert.equal(toastDuration(Array(50).fill("w").join("  ")), 16000);
});

test("tone inferred from the message when none is given", () => {
  assert.equal(inferTone("Could not load file: bad JSON"), "error");
  assert.equal(inferTone("Failed to export"), "error");
  assert.equal(inferTone("Restyled 2 graphs."), "info");
});

test("success leaves after its duration and plays the exit first", () => {
  const c = fakeClock();
  const s = new ToastStore(c.clock);
  s.show("Saved.", { tone: "success" });
  c.advance(3999);
  assert.equal(s.visible().length, 1);
  assert.equal(s.visible()[0].closing, false);
  c.advance(1);
  assert.equal(s.visible()[0].closing, true);
  c.advance(EXIT_MS);
  assert.equal(s.visible().length, 0);
});

test("errors stay until dismissed", () => {
  const c = fakeClock();
  const s = new ToastStore(c.clock);
  const id = s.show("Could not open “x.json”: not a project");
  c.advance(10 * 60 * 1000);
  assert.equal(s.visible().length, 1);
  assert.equal(s.visible()[0].tone, "error");
  s.dismiss(id);
  c.advance(EXIT_MS);
  assert.equal(s.visible().length, 0);
});

test("at most three: the oldest toast that would leave anyway makes room", () => {
  const c = fakeClock();
  const s = new ToastStore(c.clock);
  s.show("Could not do A");
  s.show("B", { tone: "success" });
  s.show("C", { tone: "info" });
  s.show("D", { tone: "info" });
  const live = s.visible().filter((t) => !t.closing).map((t) => t.message);
  assert.equal(live.length, MAX_VISIBLE);
  // the error stays; B (oldest auto-dismissing) goes; newest last
  assert.deepEqual(live, ["Could not do A", "C", "D"]);
  c.advance(EXIT_MS);
  assert.equal(s.visible().length, 3);
});

test("pausing (hover, focus, hidden tab) stops the clock; resuming keeps what was left", () => {
  const c = fakeClock();
  const s = new ToastStore(c.clock);
  s.show("Saved.", { tone: "success" }); // 4000 ms
  c.advance(3000);
  s.setPaused("hover", true);
  c.advance(60000);
  assert.equal(s.visible()[0].closing, false, "paused while hovered");
  s.setPaused("hidden", true);
  s.setPaused("hover", false);
  c.advance(60000);
  assert.equal(s.visible()[0].closing, false, "still paused while the tab is hidden");
  s.setPaused("hidden", false);
  c.advance(999);
  assert.equal(s.visible()[0].closing, false);
  c.advance(1);
  assert.equal(s.visible()[0].closing, true, "the remaining 1000 ms ran after resuming");
});

test("a progress toast resolves in place, and is told to the announcer each time", () => {
  const c = fakeClock();
  const s = new ToastStore(c.clock);
  const said: string[] = [];
  s.onMessage = (t) => said.push(`${t.tone}: ${t.message}`);
  const id = s.show("Opening x.pzfx…", { tone: "progress" });
  c.advance(60000);
  assert.equal(s.visible().length, 1, "progress does not time out");
  s.show("Imported 2 data tables.", { tone: "success", id });
  assert.equal(s.visible().length, 1, "same toast, not a second one");
  assert.equal(s.visible()[0].message, "Imported 2 data tables.");
  assert.deepEqual(said, ["progress: Opening x.pzfx…", "success: Imported 2 data tables."]);
  c.advance(toastDuration("Imported 2 data tables.") + EXIT_MS);
  assert.equal(s.visible().length, 0);
});

test("showing an id that is leaving brings it back", () => {
  const c = fakeClock();
  const s = new ToastStore(c.clock);
  s.show("Read-only.", { tone: "info", id: "ro" });
  s.dismiss("ro");
  s.show("Read-only.", { tone: "info", id: "ro" });
  c.advance(EXIT_MS);
  assert.equal(s.visible().length, 1);
  assert.equal(s.visible()[0].closing, false);
});
