// Password-protected share links: round trip, wrong password, a changed
// or cut-off link, fresh randomness per link, and the size guard.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDataSheet, makeProject } from "../../project/ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import { emptyTable, setCell } from "../../project/table.ts";
import { fromBase64Url, toBase64Url } from "../link.ts";
import {
  makeProtectedFragment, protectedPayload, ProtectError, protectJson, suggestPassword,
  unprotectJson,
} from "../protect.ts";

// Few iterations keep the tests fast; the format records the count.
const FAST = 1000;
const JSON_TEXT = JSON.stringify({ opendose_project: 2, title: "Patient cohort 649182" });

test("a protected payload opens with its password and holds no readable data", async () => {
  const payload = await protectJson(JSON_TEXT, "correct horse battery", FAST);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.equal(await unprotectJson(payload, "correct horse battery"), JSON_TEXT);
  const raw = Buffer.from(fromBase64Url(payload)).toString("latin1");
  assert.ok(!raw.includes("649182") && !raw.includes("Patient"));
});

test("a wrong password is refused with a readable reason", async () => {
  const payload = await protectJson(JSON_TEXT, "correct horse battery", FAST);
  await assert.rejects(unprotectJson(payload, "correct horse batterY"),
    (e: unknown) => e instanceof ProtectError && /wrong password/.test(e.message));
});

test("a changed or cut-off link is refused, never half-read", async () => {
  const payload = await protectJson(JSON_TEXT, "pw-0123456789", FAST);
  const bytes = fromBase64Url(payload);
  for (const at of [0, 3, 10, 25, bytes.length - 1]) {
    const changed = bytes.slice();
    changed[at] ^= 1;
    await assert.rejects(unprotectJson(toBase64Url(changed), "pw-0123456789"), ProtectError, `byte ${at}`);
  }
  await assert.rejects(unprotectJson(payload.slice(0, payload.length - 10), "pw-0123456789"), ProtectError);
  await assert.rejects(unprotectJson(payload.slice(0, 20), "pw-0123456789"), ProtectError);
  await assert.rejects(unprotectJson("not a link!", "pw-0123456789"), ProtectError);
});

test("the same project and password give a different link every time (random salt and IV)", async () => {
  const a = await protectJson(JSON_TEXT, "same password", FAST);
  const b = await protectJson(JSON_TEXT, "same password", FAST);
  assert.notEqual(a, b);
  assert.notDeepEqual(fromBase64Url(a).slice(5, 21), fromBase64Url(b).slice(5, 21));
});

test("a link asking for absurd key-derivation work is refused before deriving", async () => {
  const bytes = fromBase64Url(await protectJson(JSON_TEXT, "pw", FAST));
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(1, 0xffffffff);
  await assert.rejects(unprotectJson(toBase64Url(bytes), "pw"), ProtectError);
});

test("protected fragments are found in the address, plain ones are not", () => {
  assert.equal(protectedPayload("#e=abc_-9"), "abc_-9");
  assert.equal(protectedPayload("#x=1&e=abc"), "abc");
  assert.equal(protectedPayload("#p=abc"), null);
  assert.equal(protectedPayload(""), null);
});

test("a project becomes a #e= fragment under the size limit, or says it is too large", async () => {
  const prefs = projectPrefs(DEFAULT_PREFS);
  let t = emptyTable("column", { datasets: 2, rows: 3 });
  t = setCell(t, 0, 0, 0, "10.649182");
  const p = makeProject(prefs, [makeDataSheet("d1", "Cohort", t)], "Study");
  const ok = await makeProtectedFragment(p, "pw-0123456789", undefined, undefined, {}, FAST);
  assert.ok(ok.ok && ok.fragment.startsWith("#e="));
  if (ok.ok) {
    const json = JSON.parse(await unprotectJson(ok.fragment.slice(3), "pw-0123456789"));
    assert.equal(json.title, "Study");
  }
  const tooBig = await makeProtectedFragment(p, "pw-0123456789", undefined, 50, {}, FAST);
  assert.equal(tooBig.ok, false);
});

test("suggested passwords: five groups of four unambiguous characters, never repeated", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const pw = suggestPassword();
    assert.match(pw, /^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){4}$/);
    seen.add(pw);
  }
  assert.equal(seen.size, 200);
});
