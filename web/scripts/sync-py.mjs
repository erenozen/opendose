// Copy the Python engine (single source of truth: ../engine/opendose)
// into public/ so the browser can fetch it into Pyodide's filesystem.
//
// Writes are skipped when content is unchanged: every write here emits a
// filesystem event that any live Vite dev server must catch to keep its
// public-file registry accurate, and missed events (common on WSL2) make
// the server answer engine files with the SPA's index.html. An idempotent
// sync keeps the steady-state event count at zero.
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "engine", "opendose");
const dest = join(here, "..", "public", "py", "opendose");

mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith(".py")).sort();
let updated = 0;

for (const f of files) {
  const body = readFileSync(join(src, f));
  const target = join(dest, f);
  if (!existsSync(target) || !body.equals(readFileSync(target))) {
    writeFileSync(target, body);
    updated++;
  }
}

// Manifest tells the browser bridge which files to load — never hardcode.
const manifest = JSON.stringify(files);
const manifestPath = join(dest, "manifest.json");
if (!existsSync(manifestPath) ||
    readFileSync(manifestPath, "utf8") !== manifest) {
  writeFileSync(manifestPath, manifest);
  updated++;
}

// Drop engine files that no longer exist upstream
for (const f of readdirSync(dest)) {
  if (f.endsWith(".py") && !files.includes(f)) {
    rmSync(join(dest, f));
    updated++;
  }
}

console.log(`synced ${files.length} files (${updated} written) ` +
  `${src} -> ${dest}`);
