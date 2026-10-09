// Files chosen or dropped (several at once, or zips of them) read as the
// table files they hold, for the multi-file recipe. Everything stays in
// the browser.
import { unzipSync } from "fflate";
import { openRecipeImport } from "../events.ts";
import { isTableDrop, ZIP_FILE } from "./dropKind.ts";
import {
  decodeText, isTableEntry, sortNatural, TABLE_FILE, unzipTables, type NamedText,
} from "./multiFile.ts";

const ZIP = ZIP_FILE;

export { isTableDrop };

/** Whether a zip is a folder of table files: at least one table file and
 *  nothing a project or a Prism archive holds (.json, .pzfx, .prism). */
export function zipHoldsTables(bytes: Uint8Array): boolean {
  const names: string[] = [];
  try {
    unzipSync(bytes, { filter: (f) => { names.push(f.name); return false; } });
  } catch {
    return false;
  }
  return !names.some((n) => /\.(json|pzfx|prism)$/i.test(n)) && names.some((n) => isTableEntry(n));
}

/** Start screen: several table files, or a zip of them, open the recipe
 *  dialog for a new project; true when the drop was taken. A lone zip
 *  that turns out to be a project bundle or a Prism archive goes to
 *  `openFile` as before. */
export function takeTableDrop(files: File[], openFile: (f: File) => void, close: () => void): boolean {
  const openRecipe = (list: File[]) => openRecipeImport(list, { fresh: true });
  if (!isTableDrop(files)) return false;
  if (!(files.length === 1 && ZIP.test(files[0].name))) {
    openRecipe(files);
    close();
    return true;
  }
  void files[0].arrayBuffer().then((buf) => {
    if (zipHoldsTables(new Uint8Array(buf))) openRecipe(files); else openFile(files[0]);
    close();
  });
  return true;
}

export async function readTableFiles(files: File[]): Promise<{ files: NamedText[]; skipped: string[] }> {
  const out: NamedText[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (ZIP.test(f.name)) {
      let inside: NamedText[] = [];
      try { inside = unzipTables(bytes); } catch { inside = []; }
      if (inside.length) out.push(...inside); else skipped.push(f.name);
    } else if (TABLE_FILE.test(f.name)) {
      out.push({ name: f.name, text: decodeText(bytes) });
    } else {
      skipped.push(f.name);
    }
  }
  return { files: sortNatural(out), skipped };
}
