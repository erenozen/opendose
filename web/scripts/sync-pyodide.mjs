// Put the Python runtime into public/pyodide/v<version>/ so the site
// serves it itself: the page then contacts no other server.
//
// - The runtime (pyodide.asm.mjs / .wasm, python_stdlib.zip and the lock
//   file) is copied from the `pyodide` npm package.
// - The wheels the engine loads (NumPy, SciPy and their dependencies, as
//   named by the lock file) are downloaded from the jsDelivr copy of the
//   same Pyodide release and checked against the lock file's SHA-256.
// - The on-demand .xlsx and .xls readers (src/lib/pyodideExtras.json) is downloaded
//   from PyPI and checked against the SHA-256 pinned there.
//
// Downloads are kept in node_modules/.cache/opendose-pyodide, so only the
// first build needs the network. A file whose hash does not match stops
// the build. Unchanged files are not rewritten (see sync-py.mjs: a live
// Vite dev server must see as few filesystem events as possible), and
// other Pyodide versions' folders are removed.
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const pkg = join(web, "node_modules", "pyodide");
const version = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
const root = join(web, "public", "pyodide");
const dest = join(root, `v${version}`);
const cache = join(web, "node_modules", ".cache", "opendose-pyodide", `v${version}`);
const CDN = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const lock = JSON.parse(readFileSync(join(pkg, "pyodide-lock.json"), "utf8"));
const extras = JSON.parse(readFileSync(join(web, "src", "lib", "pyodideExtras.json"), "utf8")).wheels;

// NumPy and SciPy with their dependencies (the same walk as vite.config.ts).
const names = [];
const visit = (n) => {
  if (names.includes(n) || !lock.packages[n]) return;
  names.push(n);
  for (const d of lock.packages[n].depends ?? []) visit(d);
};
["numpy", "scipy"].forEach(visit);

async function fetchChecked(name, url, want) {
  const cached = join(cache, name);
  if (existsSync(cached)) {
    const buf = readFileSync(cached);
    if (sha256(buf) === want) return buf;
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status} from ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const got = sha256(buf);
  if (got !== want) throw new Error(`${name}: SHA-256 ${got} does not match the expected ${want}`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(cached, buf);
  return buf;
}

const files = new Map(); // name -> Buffer
for (const f of ["pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  files.set(f, readFileSync(join(pkg, f)));
}
for (const n of names) {
  const { file_name: f, sha256: want } = lock.packages[n];
  files.set(f, await fetchChecked(f, CDN + f, want));
}
for (const { file, sha256: want, url } of extras) {
  files.set(file, await fetchChecked(file, url, want));
}

mkdirSync(dest, { recursive: true });
let updated = 0;
for (const [f, buf] of files) {
  const target = join(dest, f);
  if (!existsSync(target) || !buf.equals(readFileSync(target))) {
    writeFileSync(target, buf);
    updated++;
  }
}
let removed = 0;
for (const f of readdirSync(dest)) {
  if (!files.has(f)) { rmSync(join(dest, f)); removed++; }
}
for (const d of readdirSync(root)) {
  if (d !== `v${version}`) { rmSync(join(root, d), { recursive: true, force: true }); removed++; }
}
const mb = [...files.values()].reduce((s, b) => s + b.length, 0) / 1e6;
console.log(`sync-pyodide: Pyodide ${version}, ${files.size} files (${mb.toFixed(1)} MB) in public/pyodide/v${version}`
  + ` (${updated} written, ${removed} removed)`);
