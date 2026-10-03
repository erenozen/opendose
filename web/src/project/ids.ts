// Sheet ids: short, unique within a project, stable across save/load.
export type IdFactory = () => string;

let counter = 0;
export const newId: IdFactory = () => {
  counter = (counter + 1) % 1e6;
  const rand = Math.random().toString(36).slice(2, 8);
  return `s${Date.now().toString(36)}${counter.toString(36)}${rand}`;
};

/** Deterministic ids for tests. */
export function sequentialIds(prefix = "id"): IdFactory {
  let n = 0;
  return () => `${prefix}${++n}`;
}
