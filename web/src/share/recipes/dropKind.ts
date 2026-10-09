// What a set of chosen or dropped files is, by name alone (no reading):
// small, so the Import dialog can ask without loading the readers.

/** Files read as tables. */
export const TABLE_FILE = /\.(csv|tsv|txt|tab|dat)$/i;
export const ZIP_FILE = /\.zip$/i;

/** Whether these files are tables to stack (several table files, or a
 *  zip): what the start screen and the Import dialog hand to the recipe
 *  dialog instead of opening one file. A lone zip may still be a project
 *  bundle or a Prism archive (readFiles.ts zipHoldsTables says). */
export function isTableDrop(files: { name: string }[]): boolean {
  if (!files.length) return false;
  if (files.some((f) => /\.(json|pzfx|prism|xlsx)$/i.test(f.name))) return false;
  const tables = files.filter((f) => TABLE_FILE.test(f.name)).length;
  const zips = files.filter((f) => ZIP_FILE.test(f.name)).length;
  return tables + zips === files.length && (tables >= 2 || zips >= 1);
}
