// Tabs: views of one thing, one at a time (a tool with two modes, the
// steps of an import). WAI-ARIA tabs with a roving tab stop: Tab reaches
// the selected tab only, Arrow Left / Right (and Home / End) move and
// select, and the panel is labelled by its tab.
//
//   <Tabs value={tab} onValueChange={setTab}>
//     <Tabs.List aria-label="Tool">
//       <Tabs.Tab value="power">Power and sample size</Tabs.Tab>
//       <Tabs.Tab value="random">Randomisation list</Tabs.Tab>
//     </Tabs.List>
//     <Tabs.Panel value="power">…</Tabs.Panel>
//     <Tabs.Panel value="random">…</Tabs.Panel>
//   </Tabs>
//
// Panels mount only while selected. The selected tab keeps the weight of
// the others, so the row never shifts.
import {
  createContext, useContext, useId, useRef, type ComponentProps, type KeyboardEvent, type ReactNode,
} from "react";
import "./Tabs.css";

interface Ctx {
  value: string;
  select: (v: string) => void;
  base: string;
}
const TabsContext = createContext<Ctx | null>(null);
const useTabs = () => {
  const c = useContext(TabsContext);
  if (!c) throw new Error("Tabs parts must sit inside <Tabs>");
  return c;
};
const idOf = (base: string, v: string, part: "tab" | "panel") =>
  `${base}-${part}-${v.replace(/[^A-Za-z0-9_-]/g, "_")}`;

function Tabs<T extends string>({ value, onValueChange, children }: {
  value: T;
  onValueChange: (v: T) => void;
  children: ReactNode;
}) {
  const base = useId();
  return (
    <TabsContext.Provider value={{ value, select: (v) => onValueChange(v as T), base }}>
      {children}
    </TabsContext.Provider>
  );
}

/** The row of tabs. Name it with aria-label. */
function List({ className = "", onKeyDown, ...props }: ComponentProps<"div">) {
  const { select } = useTabs();
  const el = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const tabs = [...(el.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [])];
    const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const to = e.key === "ArrowRight" ? (at + 1) % tabs.length
      : e.key === "ArrowLeft" ? (at - 1 + tabs.length) % tabs.length
        : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tabs[to].focus();
    const v = tabs[to].dataset.value;
    if (v !== undefined) select(v);
  };
  return <div role="tablist" {...props} ref={el} className={`ui-tabs ${className}`}
    data-still onKeyDown={onKey} />;
}

function Tab({ value: v, className = "", onClick, ...props }: Omit<ComponentProps<"button">, "value"> & {
  value: string;
}) {
  const { value, select, base } = useTabs();
  const on = v === value;
  return (
    <button type="button" role="tab" {...props} id={idOf(base, v, "tab")} data-value={v}
      aria-selected={on} aria-controls={on ? idOf(base, v, "panel") : undefined}
      tabIndex={on ? 0 : -1} className={`ui-tab ${className}`}
      onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) select(v); }} />
  );
}

function Panel({ value: v, className = "", ...props }: Omit<ComponentProps<"div">, "value"> & {
  value: string;
}) {
  const { value, base } = useTabs();
  if (v !== value) return null;
  return <div role="tabpanel" {...props} id={idOf(base, v, "panel")}
    aria-labelledby={idOf(base, v, "tab")} className={`ui-tab-panel ${className}`} />;
}

Tabs.List = List;
Tabs.Tab = Tab;
Tabs.Panel = Panel;

export default Tabs;
