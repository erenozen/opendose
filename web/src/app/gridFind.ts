// "Find in this table" and "Replace in this table" from the command
// palette: the data grid of that table opens its find bar, with or
// without the replace row (sheets/common/GridFindBar.tsx).
export const GRID_FIND_EVENT = "opendose-grid-find";
export const GRID_REPLACE_EVENT = "opendose-grid-replace";

export function openGridFind(dataId: string): void {
  window.dispatchEvent(new CustomEvent<string>(GRID_FIND_EVENT, { detail: dataId }));
}

export function openGridReplace(dataId: string): void {
  window.dispatchEvent(new CustomEvent<string>(GRID_REPLACE_EVENT, { detail: dataId }));
}

function listen(event: string, fn: (dataId: string) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail);
  window.addEventListener(event, h);
  return () => window.removeEventListener(event, h);
}

export const onGridFind = (fn: (dataId: string) => void) => listen(GRID_FIND_EVENT, fn);
export const onGridReplace = (fn: (dataId: string) => void) => listen(GRID_REPLACE_EVENT, fn);
