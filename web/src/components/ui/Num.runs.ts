// The number runs of a sentence, for NumText (Num.tsx). Pure; unit-tested.

// One number: a sign, digits with separators, an exponent, a percent.
const N = String.raw`[-−+]?\d[\d,.]*(?:[eE][-−+]?\d+)?%?`;
// With what must stay on its line: "P = ", "n = ", "< ", and a range's "to".
const TOKEN = new RegExp(
  String.raw`(?:\b[Pn] ?(?=[<>≤≥=]))?(?:[<>≤≥=] ?)?${N}(?: to [<>]? ?${N})?`, "g");

/** Splits `text` into plain runs and numbers. */
export function numberRuns(text: string): { text: string; num: boolean }[] {
  const out: { text: string; num: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    // a digit inside a word ("IC50", "log10") is part of the word
    if (i > 0 && /[A-Za-zµ]/.test(text[i - 1]) && /^\d/.test(m[0])) continue;
    if (i > at) out.push({ text: text.slice(at, i), num: false });
    out.push({ text: m[0], num: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), num: false });
  return out;
}

