// Ranking for the command palette (Ctrl/Cmd+K): commands by word prefix,
// the ones for the sheet on screen ahead of global ones (DECISIONS 5).
// Pure, so it is unit tested (app/__tests__/commandRank.test.ts).

export interface Rankable {
  label: string;
  /** More words that match (not shown). */
  keywords?: string;
  /** Acts on the sheet on screen or its family. */
  context?: boolean;
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter(Boolean);

/**
 * How well `query` matches a command: 0 when the label starts with it,
 * 1 when every typed word starts a word of the label, 2 when every typed
 * word starts a word of the label or its keywords, 3 when every typed
 * word only appears inside the label; null for no match.
 */
export function commandScore(c: Rankable, query: string): number | null {
  const q = words(query);
  if (!q.length) return null;
  const label = c.label.toLowerCase();
  if (label.startsWith(query.trim().toLowerCase())) return 0;
  const lw = words(c.label);
  if (q.every((w) => lw.some((x) => x.startsWith(w)))) return 1;
  const kw = [...lw, ...words(c.keywords ?? "")];
  if (q.every((w) => kw.some((x) => x.startsWith(w)))) return 2;
  if (q.every((w) => label.includes(w))) return 3;
  return null;
}

/** The commands that match `query`, best first; on a tie the context
 *  commands come first, then the registry's order. */
export function rankCommands<T extends Rankable>(list: T[], query: string): { item: T; score: number }[] {
  return list
    .map((item, i) => ({ item, score: commandScore(item, query), i }))
    .filter((x): x is { item: T; score: number; i: number } => x.score !== null)
    .sort((a, b) => a.score - b.score
      || Number(!!b.item.context) - Number(!!a.item.context) || a.i - b.i)
    .map(({ item, score }) => ({ item, score }));
}

export type PaletteEntry<C, S> = { kind: "command"; item: C } | { kind: "sheet"; item: S };

/** One list from ranked commands and matching sheets: strong command
 *  matches (the label or its words start with what was typed) first,
 *  then the sheets, then the weaker command matches. */
export function mergeResults<C, S>(commands: { item: C; score: number }[], sheets: S[],
  max = 50): PaletteEntry<C, S>[] {
  const strong = commands.filter((c) => c.score <= 1);
  const weak = commands.filter((c) => c.score > 1);
  return [
    ...strong.map((c) => ({ kind: "command" as const, item: c.item })),
    ...sheets.map((s) => ({ kind: "sheet" as const, item: s })),
    ...weak.map((c) => ({ kind: "command" as const, item: c.item })),
  ].slice(0, max);
}
