// Smallest and largest of a data-sized list without spreading it into
// Math.min/Math.max: a call's arguments live on the stack, so spreading a
// few hundred thousand values throws "RangeError: Maximum call stack size
// exceeded". These give exactly what Math.min(...values) and
// Math.max(...values) give: Infinity / -Infinity for an empty list, NaN
// when any value is NaN, the same coercion of non-numbers and the same
// -0 / +0 order (each step is a two-argument Math.min / Math.max).

/** Math.min(...values) for any length. */
export function minOf(values: Iterable<number>): number {
  let m = Infinity;
  for (const v of values) m = Math.min(m, v);
  return m;
}

/** Math.max(...values) for any length. */
export function maxOf(values: Iterable<number>): number {
  let m = -Infinity;
  for (const v of values) m = Math.max(m, v);
  return m;
}

/** Appends every item of `more` to `list` (list.push(...more) for any length). */
export function pushAll<T>(list: T[], more: Iterable<T>): T[] {
  for (const v of more) list.push(v);
  return list;
}
