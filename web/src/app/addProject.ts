// "Add from project…" (P-74): project files whose sheets go into the open
// project. A window event, answered by components/AddFromProject.tsx, so
// the File menu, the palette and a page drop share one path.
const EVENT = "opendose-add-project";

/** Add these OpenDose project files to the open project, one after the
 *  other; with no files, ask for them with the file picker. */
export function addProjectFiles(files?: File[]): void {
  window.dispatchEvent(new CustomEvent<File[] | undefined>(EVENT, { detail: files }));
}

export function onAddProjectFiles(fn: (files: File[] | undefined) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<File[] | undefined>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** A page drop of several files: two or more OpenDose project files
 *  (.json) are added to the open project; the drop's other files are
 *  named as not opened. One .json still opens in place of the project,
 *  and table files keep their own route (one: the Import dialog; two or
 *  more, or a zip: the recipe import), so the drop is decided by type.
 *  Returns the project files to add, or null when the drop is not one. */
export function projectsInDrop<F extends { name: string }>(files: F[]):
  { add: F[]; skipped: F[] } | null {
  const add = files.filter((f) => /\.json$/i.test(f.name));
  if (add.length < 2) return null;
  return { add, skipped: files.filter((f) => !add.includes(f)) };
}
