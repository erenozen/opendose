// Preferences › "Colours pinned to groups" (P-56): choose a colour for a
// group name ("KO" = orange) that every graph in the project draws a data
// set of that name in. Kept in the project (Project.groupColors), not in
// this browser, so the file and its share links carry it. The pinned
// colours are checked as they are chosen (graph/nameColors.ts
// pinWarnings: contrast and colour-vision confusion), and warned about,
// never refused.
import { useId, useMemo, useState } from "react";
import { useProject } from "../app/context";
import { nameKey, pinWarnings } from "../graph/nameColors";
import { seriesStyle } from "../lib/palette";
import { EXPORT_CHROME_DARK } from "../lib/chrome";
import type { GroupColor, Project } from "../project/types";
import { Button, Field } from "./ui";

/** Group names of the project's data tables, first spelling of each. */
function groupNames(p: Project): string[] {
  const seen = new Map<string, string>();
  for (const s of p.sheets) {
    if (s.kind !== "data") continue;
    for (const d of s.table.datasets) {
      const k = nameKey(d.name);
      if (k && !seen.has(k)) seen.set(k, d.name.trim());
    }
  }
  return [...seen.values()];
}

export default function GroupColorPins() {
  const { project, apply, prefs } = useProject();
  const pins = useMemo(() => project.groupColors ?? [], [project.groupColors]);
  const names = useMemo(() => groupNames(project), [project]);
  const free = names.filter((n) => !pins.some((p) => nameKey(p.name) === nameKey(n)));
  const [pick, setPick] = useState("");
  const chosen = free.includes(pick) ? pick : free[0] ?? "";
  const auto = seriesStyle(Math.max(0, names.indexOf(chosen)), false, prefs.scheme).color;
  const [color, setColor] = useState<string | null>(null);
  const ids = useId();
  const warnings = useMemo(() => pinWarnings(pins, EXPORT_CHROME_DARK.surface), [pins]);

  const save = (next: GroupColor[], key: string) => apply((p) => {
    const { groupColors: _old, ...rest } = p;
    void _old;
    return next.length ? { ...rest, groupColors: next } : rest;
  }, key);

  return (
    <section className="prefs-pins" aria-labelledby={`${ids}-title`}>
      <h3 className="prefs-subtitle" id={`${ids}-title`}>Colours pinned to groups</h3>
      <p className="prefs-note">
        Every graph in this project draws a group of that name in its colour, in light and dark
        and in exports. A colour set on a graph still wins. Saved with the project.
      </p>
      {pins.length > 0 && (
        <ul className="pins-list">
          {pins.map((p, i) => (
            <li key={nameKey(p.name)}>
              <span className="pins-name">{p.name}</span>
              <input type="color" value={p.color} aria-label={`Colour of “${p.name}”`}
                onChange={(e) => save(pins.map((q, j) => (j === i ? { ...q, color: e.target.value.toLowerCase() } : q)),
                  `pin-color:${nameKey(p.name)}`)} />
              <Button size="sm" aria-label={`Unpin “${p.name}”`}
                onClick={() => save(pins.filter((_, j) => j !== i), "pin-remove")}>Unpin</Button>
            </li>
          ))}
        </ul>
      )}
      {free.length > 0 ? (
        <div className="pins-add">
          <Field label="Group" id={`${ids}-group`} className="pins-group">
            <select id={`${ids}-group`} value={chosen}
              onChange={(e) => { setPick(e.target.value); setColor(null); }}>
              {free.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Colour" id={`${ids}-color`}>
            <input id={`${ids}-color`} type="color" value={color ?? auto}
              onChange={(e) => setColor(e.target.value.toLowerCase())} />
          </Field>
          <Button size="sm" onClick={() => {
            save([...pins, { name: chosen, color: color ?? auto }], "pin-add");
            setColor(null);
          }}>Pin colour</Button>
        </div>
      ) : pins.length === 0 && (
        <p className="prefs-note">Name the data sets in a table to pin a colour to a group.</p>
      )}
      <div role="status" className="pins-warnings">
        {warnings.map((w) => <p key={w}>{w}</p>)}
      </div>
    </section>
  );
}
