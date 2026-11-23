// "Find in this table" from the command palette: the data grid of that
// table opens its find bar (sheets/common/GridFindBar.tsx).
export const GRID_FIND_EVENT = "opendose-grid-find";

export function openGridFind(dataId: string): void {
  window.dispatchEvent(new CustomEvent<string>(GRID_FIND_EVENT, { detail: dataId }));
}

export function onGridFind(fn: (dataId: string) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail);
  window.addEventListener(GRID_FIND_EVENT, h);
  return () => window.removeEventListener(GRID_FIND_EVENT, h);
}
