// Model picker for curve fits: a button showing the current model that
// opens a searchable list grouped by family (the engine's equation
// library), the user's saved equations ("My equations", stored in this
// browser, importable / exportable as JSON) and "Enter your own
// "Enter your own equation…". The list is a combobox (a search field over
// a listbox) in a Popover anchored to the button (docs/design/
// overlays.md): type to filter, arrows, Home and End move, Enter picks;
// Escape and a press outside close it and focus returns to the button.
// Below the button: the equation and parameters of the choice.
import {
  useEffect, useId, useMemo, useState, useSyncExternalStore,
  type KeyboardEvent, type ReactNode,
} from "react";
import {
  MODELS_META, modelLibraryVersion, searchModels, subscribeModelLibrary,
  USER_MODEL_ID, type ModelMeta,
} from "../lib/modelLibrary";
import {
  exportEquations, importEquations, savedEquations, subscribeEquations,
  type UserEquationDef,
} from "../lib/userEquation";
import { downloadText } from "../sheets/common/download";
import { Button, FileButton, Popover } from "./ui";
import "./modelPicker.css";

type Item =
  | { kind: "model"; key: string; meta: ModelMeta }
  | { kind: "saved"; key: string; eq: UserEquationDef }
  | { kind: "new"; key: string };

interface Props {
  value: string;
  userEquation?: UserEquationDef | null;
  readOnly?: boolean;
  onPickModel: (id: string) => void;
  onPickEquation: (eq: UserEquationDef) => void;
  onNewEquation: () => void;
  onEditEquation: () => void;
}

export default function ModelPicker({
  value, userEquation, readOnly, onPickModel, onPickEquation, onNewEquation, onEditEquation,
}: Props) {
  const libVersion = useSyncExternalStore(subscribeModelLibrary, modelLibraryVersion);
  const saved = useSyncExternalStore(subscribeEquations, savedEquations);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [note, setNote] = useState("");
  const uid = useId();

  const isUser = value === USER_MODEL_ID;
  const meta = isUser ? null : MODELS_META[value] ?? null;

  const groups = useMemo(() => (libVersion >= 0 ? searchModels(query) : []), [query, libVersion]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const mine = saved.filter((e) => {
    const hay = `${e.name} ${e.text} my equations`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const items: Item[] = [];
  for (const g of groups) for (const m of g.models) items.push({ kind: "model", key: m.id, meta: m });
  for (const e of mine) items.push({ kind: "saved", key: `saved:${e.id}`, eq: e });
  items.push({ kind: "new", key: "new" });
  const activeIdx = Math.min(active, items.length - 1);
  const optId = (i: number) => `${uid}-opt-${i}`;

  const activeId = optId(activeIdx);
  useEffect(() => {
    if (!open) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  // The Popover returns focus to the button when it closes.
  const close = () => {
    setOpen(false);
    setQuery("");
    setNote("");
  };
  const choose = (it: Item) => {
    if (it.kind === "model") onPickModel(it.meta.id);
    else if (it.kind === "saved") onPickEquation(it.eq);
    else onNewEquation();
    close();
  };
  const openList = () => {
    const i = items.findIndex((it) => (it.kind === "model" && it.meta.id === value)
      || (isUser && it.kind === "saved" && it.eq.id === userEquation?.id));
    setActive(Math.max(0, i));
    setOpen(true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(items.length - 1, activeIdx + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, activeIdx - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[activeIdx]) choose(items[activeIdx]); }
  };

  let idx = -1;
  const renderOption = (it: Item, label: ReactNode, sub?: string) => {
    idx += 1;
    const i = idx;
    const selected = (it.kind === "model" && it.meta.id === value)
      || (it.kind === "saved" && isUser && it.eq.id === userEquation?.id);
    return (
      <div key={it.key} id={optId(i)} role="option" aria-selected={selected}
        className={`mp-option${i === activeIdx ? " active" : ""}${selected ? " selected" : ""}`}
        onPointerMove={() => { if (i !== activeIdx) setActive(i); }}
        onClick={() => choose(it)}>
        <span className="mp-option-label">{label}</span>
        {sub && <span className="mp-option-sub">{sub}</span>}
      </div>
    );
  };

  const label = isUser
    ? `User-defined: ${userEquation?.name?.trim() || "equation"}`
    : meta?.label ?? value;
  const family = isUser ? "My equation" : meta?.family ?? "";

  return (
    <div className="model-picker">
      <Popover open={open} onOpenChange={(o) => (o ? openList() : close())}>
        <Popover.Trigger className="mp-button" data-still disabled={readOnly}>
          <span className="sr-only">Model: </span>
          <span className="mp-button-label">{label}</span>
          <span className="mp-button-family">{family}</span>
        </Popover.Trigger>
        <Popover.Content className="mp-panel" aria-label="Choose a model" side="bottom" align="start"
          onKeyDown={onKey}>
          <input type="search" className="mp-search"
            role="combobox" aria-expanded="true" aria-autocomplete="list"
            aria-controls={`${uid}-list`} aria-activedescendant={optId(activeIdx)}
            aria-label="Search models" placeholder="Search by name, family or parameter…"
            value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
          <div id={`${uid}-list`} role="listbox" aria-label="Models"
            className="mp-list" tabIndex={-1}>
            {groups.map((g) => (
              <div key={g.family} role="group" aria-labelledby={`${uid}-g-${g.family}`}>
                <div id={`${uid}-g-${g.family}`} className="mp-group" role="presentation">
                  {g.family}
                </div>
                {g.models.map((m) => renderOption({ kind: "model", key: m.id, meta: m },
                  m.label, m.globalOnly ? "global fit to all data sets" : undefined))}
              </div>
            ))}
            {mine.length > 0 && (
              <div role="group" aria-labelledby={`${uid}-g-mine`}>
                <div id={`${uid}-g-mine`} className="mp-group" role="presentation">My equations</div>
                {mine.map((e) => renderOption({ kind: "saved", key: `saved:${e.id}`, eq: e },
                  e.name.trim() || "Untitled equation", e.text.split(/\r?\n/).find((l) => /=/.test(l))))}
              </div>
            )}
            <div role="group" aria-labelledby={`${uid}-g-own`}>
              <div id={`${uid}-g-own`} className="mp-group" role="presentation">User-defined</div>
              {renderOption({ kind: "new", key: "new" }, "Enter your own equation…")}
            </div>
          </div>
          <div className="mp-tools">
            <span className="mp-count">
              {items.length - 1} match{items.length - 1 === 1 ? "" : "es"}
            </span>
            <Button size="sm" variant="ghost" disabled={!saved.length}
              onClick={() => downloadText("my-equations.json", exportEquations(), "application/json")}>
              Export my equations
            </Button>
            <FileButton size="sm" variant="ghost" accept=".json,application/json"
              inputLabel="Import saved equations (JSON)"
              onFile={async (f) => {
                try {
                  const n = importEquations(await f.text());
                  setNote(`Imported ${n} equation${n === 1 ? "" : "s"}.`);
                } catch (err) {
                  setNote(`Could not import “${f.name}”: ${(err as Error).message}`);
                }
              }}>
              Import…
            </FileButton>
          </div>
          {/* Always mounted, so the import's outcome is announced. */}
          <p className="hint-block mp-note" role="status">{note}</p>
        </Popover.Content>
      </Popover>

      {isUser ? (
        <div className="mp-summary">
          <pre className="mp-equation">{userEquation?.text || "No equation entered yet"}</pre>
          <Button size="sm" disabled={readOnly} onClick={onEditEquation}>Edit equation…</Button>
        </div>
      ) : meta && (
        <div className="mp-summary">
          {meta.equation && <pre className="mp-equation">{meta.equation.replace(/;\s*/g, "\n")}</pre>}
          {meta.parameters && meta.parameters.length > 0 && (
            <p className="hint-block">
              Parameters: {meta.parameters.join(", ")}
              {meta.derived && meta.derived.length > 0 && <> · also reports {meta.derived.join(", ")}</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
