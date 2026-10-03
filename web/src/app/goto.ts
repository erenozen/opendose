// "Go to sheet" ranking (Ctrl/Cmd+K).
import { allNotes } from "../project/notes";
import { findSheet } from "../project/ops";
import type { Project, Sheet } from "../project/types";

const MAX = 50;

/** Words of the query must all appear in the sheet's name, its table's
 *  name or its floating notes; name matches rank first. */
export function rankSheets(p: Project, query: string, recent: string[]): Sheet[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const notesBy = new Map<string, string>();
  for (const { sheet, note } of allNotes(p)) {
    notesBy.set(sheet.id, `${notesBy.get(sheet.id) ?? ""} ${note.text.toLowerCase()}`);
  }
  const ownerName = (s: Sheet) => (s.kind === "results" || s.kind === "graph"
    ? findSheet(p, s.parentId)?.name ?? "" : "");
  const scored: { s: Sheet; score: number; i: number }[] = [];
  p.sheets.forEach((s, i) => {
    const name = s.name.toLowerCase();
    const hay = `${name} ${ownerName(s).toLowerCase()} ${notesBy.get(s.id) ?? ""}`;
    if (!words.every((w) => hay.includes(w))) return;
    const r = recent.indexOf(s.id);
    let score = 0;
    if (words.length) {
      if (name.startsWith(words[0])) score -= 3;
      else if (words.every((w) => name.includes(w))) score -= 2;
    }
    if (r >= 0) score -= 1 - r / (recent.length + 1);
    scored.push({ s, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return scored.slice(0, MAX).map((x) => x.s);
}

