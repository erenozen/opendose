// Save in place (P-71): the pieces that do not need a browser. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canPickFiles, isHandle, linkedFile, linkFile, onLinkChange, openPickerTypes, projectFileName,
  saveFailure, SaveRefused, unlinkFile, writeToHandle, type FileHandleLike,
} from "../fileSave.ts";
// The shape of useFileOpen's OPEN_ACCEPT (that module needs React).
const OPEN_ACCEPT_LIST = ".json,.pzfx,.prism,.zip,text/csv,.csv";

function fakeHandle(perm: { query: PermissionState; request?: PermissionState }) {
  const written: string[] = [];
  let closed = 0;
  let asked = 0;
  const h: FileHandleLike = {
    name: "study.json",
    getFile: async () => new File([written.join("")], "study.json"),
    createWritable: async () => ({
      write: async (d) => { written.push(String(d)); },
      close: async () => { closed++; },
    }),
    queryPermission: async () => perm.query,
    requestPermission: async () => { asked++; return perm.request ?? perm.query; },
  };
  return { h, written, closed: () => closed, asked: () => asked };
}

test("the file name follows the project title, as the download names it", () => {
  assert.equal(projectFileName("Assay 3: HepG2 (72 h)"), "assay-3-hepg2-72-h.json");
  assert.equal(projectFileName("   "), "opendose-project.json");
  assert.equal(projectFileName("µM — 2"), "m-2.json");
});

test("the open picker offers the extensions of the Open input, MIME types left out", () => {
  const types = openPickerTypes(OPEN_ACCEPT_LIST);
  assert.equal(types.length, 1);
  const exts = Object.values(types[0].accept)[0];
  assert.deepEqual(exts, [".json", ".pzfx", ".prism", ".zip", ".csv"]);
});

test("a granted handle is written once, closed, and no prompt is shown", async () => {
  const f = fakeHandle({ query: "granted" });
  await writeToHandle(f.h, '{"opendose_project": 2}');
  assert.deepEqual(f.written, ['{"opendose_project": 2}']);
  assert.equal(f.closed(), 1);
  assert.equal(f.asked(), 0);
});

test("a handle read back from storage asks for permission again, then writes", async () => {
  const f = fakeHandle({ query: "prompt", request: "granted" });
  await writeToHandle(f.h, "text");
  assert.equal(f.asked(), 1);
  assert.deepEqual(f.written, ["text"]);
});

test("refused permission writes nothing and says why", async () => {
  const f = fakeHandle({ query: "prompt", request: "denied" });
  await assert.rejects(writeToHandle(f.h, "text"), (e: unknown) => e instanceof SaveRefused
    && saveFailure(e) === "permission to write the file was not given");
  assert.deepEqual(f.written, []);
});

test("failures read as the reason of an error toast", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });
  assert.equal(saveFailure(named("NotFoundError")), "the file was moved or deleted");
  assert.equal(saveFailure(named("NotAllowedError")), "permission to write the file was not given");
  assert.equal(saveFailure(new Error("disk said no.")), "disk said no");
});

test("only a real handle counts as one (a JSON copy of a handle is {})", () => {
  assert.equal(isHandle(fakeHandle({ query: "granted" }).h), true);
  assert.equal(isHandle({}), false);
  assert.equal(isHandle(null), false);
});

test("linking notifies once per change; unlinking clears it", () => {
  let n = 0;
  const off = onLinkChange(() => { n++; });
  const { h } = fakeHandle({ query: "granted" });
  linkFile(h);
  linkFile(h);
  assert.equal(linkedFile(), h);
  unlinkFile();
  assert.equal(linkedFile(), null);
  assert.equal(n, 2);
  off();
});

test("without the File System Access API (Firefox, Safari, Node) nothing is picked", () => {
  assert.equal(canPickFiles(), false);
});
