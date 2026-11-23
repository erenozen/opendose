import {
  createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState,
  type ComponentProps, type MouseEvent, type ReactNode, type RefObject,
} from "react";
import {
  restoreFocus, useDismiss, useMergedRefs, usePresence, useReturnFocus, useTopLayer,
} from "./useDismiss.ts";
import { boxOf, pointBox, useAnchoredPosition, type AnchorOptions } from "./Popover.anchor.ts";
import { isTypeaheadKey, moveIndex, typeahead, TYPEAHEAD_RESET_MS } from "./Menu.keys.ts";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./buttonClass";
import "./Popover.css";
import "./Menu.css";

/*
 * Menu (WAI-ARIA menu button):
 *
 *   <Menu>
 *     <Menu.Trigger>Tools</Menu.Trigger>
 *     <Menu.Content aria-label="Tools" align="end">
 *       <Menu.Item onSelect={…} shortcut="⌘S">Save</Menu.Item>
 *       <Menu.Separator />
 *       <Menu.Group label="Assays">…</Menu.Group>
 *       <Menu.RadioGroup label="Theme" value={t} onValueChange={setT}>
 *         <Menu.RadioItem value="dark">Dark</Menu.RadioItem>
 *       </Menu.RadioGroup>
 *     </Menu.Content>
 *   </Menu>
 *
 * Roving tabindex (one item in the tab order), arrows wrap, Home/End,
 * type-ahead, Enter/Space activate, Tab closes, Escape and activation
 * give focus back to the trigger unless the item moved it (a dialog). A
 * context menu has no trigger: pass `anchorPoint` and control `open`.
 * Shares the Popover's top layer, placement and dismiss hook.
 */

export type MenuCloseReason = "trigger" | "escape" | "outside" | "tab" | "select";

interface Ctx {
  open: boolean;
  setOpen: (open: boolean, reason: MenuCloseReason) => void;
  trigger: RefObject<HTMLButtonElement | null>;
  triggerId: string;
  menuId: string;
  /** Which item gets focus when the menu opens. */
  entry: RefObject<"first" | "last">;
  anchorPoint?: { x: number; y: number };
  returnFocus: boolean;
  onExitComplete?: () => void;
}
const MenuContext = createContext<Ctx | null>(null);
const useMenu = () => {
  const c = useContext(MenuContext);
  if (!c) throw new Error("Menu parts must sit inside <Menu>");
  return c;
};

function Menu({
  open: openProp, defaultOpen = false, onOpenChange, anchorPoint, returnFocus = true,
  onExitComplete, children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, reason: MenuCloseReason) => void;
  /** Open at a point (a context menu) instead of under a trigger. */
  anchorPoint?: { x: number; y: number };
  /** Give focus back to the trigger on close (default). Off when the
   *  caller restores focus itself. */
  returnFocus?: boolean;
  /** Called once the menu has finished closing (after its exit). */
  onExitComplete?: () => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : inner;
  const trigger = useRef<HTMLButtonElement>(null);
  const entry = useRef<"first" | "last">("first");
  const triggerId = useId();
  const menuId = useId();
  const setOpen = useCallback((o: boolean, reason: MenuCloseReason) => {
    if (!controlled) setInner(o);
    onOpenChange?.(o, reason);
  }, [controlled, onOpenChange]);
  const value = useMemo(() => ({
    open, setOpen, trigger, triggerId, menuId, entry, anchorPoint, returnFocus, onExitComplete,
  }), [open, setOpen, triggerId, menuId, anchorPoint, returnFocus, onExitComplete]);
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

/** Trigger props: a plain button, or with `variant` a Button of that
 *  variant and size (ghost in a toolbar or the header, a keycap alone). */
export type TriggerProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

/** The menu button. ArrowDown opens on the first item, ArrowUp on the last. */
function Trigger({ ref, onClick, onKeyDown, variant, size, className, ...props }: TriggerProps) {
  const { open, setOpen, trigger, triggerId, menuId, entry } = useMenu();
  const setRef = useMergedRefs(trigger, ref);
  return (
    <button type="button" id={triggerId} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} {...props} ref={setRef}
      className={variant ? buttonClass(variant, size, className) : className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        entry.current = "first";
        setOpen(!open, "trigger");
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
        e.preventDefault();
        entry.current = e.key === "ArrowDown" ? "first" : "last";
        setOpen(true, "trigger");
      }} />
  );
}

const ITEMS = "[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]";
const itemsOf = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
const labelOf = (el: HTMLElement) => el.dataset.text
  ?? el.querySelector("span")?.textContent ?? el.getAttribute("aria-label") ?? el.textContent ?? "";
/** One item in the tab order: the focused one (roving tabindex). */
const rove = (items: HTMLElement[], active: HTMLElement | undefined) => {
  for (const it of items) it.tabIndex = it === active ? 0 : -1;
};

type ContentProps = Omit<ComponentProps<"div">, "popover"> & AnchorOptions;

/** The list of items. Name it with aria-label (or it takes the trigger's name). */
function Content({
  ref, side = "bottom", align = "start", sideOffset = 6, collisionPadding, collisionBoundary,
  className = "", children, onKeyDown, onFocus, ...props
}: ContentProps) {
  const ctx = useMenu();
  const { open, setOpen, trigger, triggerId, menuId, entry, anchorPoint, returnFocus } = ctx;
  const el = useRef<HTMLDivElement>(null);
  const setRef = useMergedRefs(el, ref);
  const { mounted, state, instant } = usePresence(open, el, ctx.onExitComplete);
  useTopLayer(el, mounted);
  useAnchoredPosition(el, mounted,
    () => (anchorPoint ? pointBox(anchorPoint) : boxOf(trigger.current)),
    { side, align, sideOffset, collisionPadding, collisionBoundary },
    anchorPoint && `${anchorPoint.x},${anchorPoint.y}`);
  useDismiss({
    open, layer: el, trigger,
    onDismiss: (reason) => {
      setOpen(false, reason);
      // A press outside moves focus after this runs: check again once it has.
      if (returnFocus && reason === "outside") {
        setTimeout(() => restoreFocus(trigger.current, el.current));
      }
    },
  });
  useReturnFocus(open, mounted, el, trigger, returnFocus);
  useLayoutEffect(() => {
    const node = el.current;
    if (!open || !node) return;
    const items = itemsOf(node);
    const first = entry.current === "last" ? items[items.length - 1] : items[0];
    rove(items, first);
    (first ?? node).focus({ preventScroll: true });
    entry.current = "first";
  }, [open, entry]);

  const typed = useRef({ buffer: "", at: 0 });
  if (!mounted) return null;

  const focusItem = (items: HTMLElement[], i: number) => {
    const it = items[i];
    if (!it) return;
    rove(items, it);
    it.focus();
    it.scrollIntoView({ block: "nearest" });
  };

  return (
    <div role="menu" aria-labelledby={props["aria-label"] ? undefined : triggerId}
      {...props} id={menuId} ref={setRef} popover="manual" tabIndex={-1} data-still
      className={`sheet-menu ui-layer ${className}`} data-state={state}
      data-instant={instant || undefined}
      onFocus={(e) => {
        onFocus?.(e);
        const items = itemsOf(el.current);
        if (items.includes(e.target as HTMLElement)) rove(items, e.target as HTMLElement);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        const items = itemsOf(el.current);
        const i = items.indexOf(document.activeElement as HTMLElement);
        const to = moveIndex(e.key, i, items.length);
        if (to !== null) {
          e.preventDefault();
          focusItem(items, to);
        } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft")
          && items[i]?.closest("[data-orientation=horizontal]")) {
          // A horizontal row (colour swatches): left and right step along it.
          e.preventDefault();
          focusItem(items, (i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length);
        } else if (e.key === "Tab") {
          setOpen(false, "tab");
          rove(items, undefined);
          // Focus the trigger first, so Tab continues from it in the page.
          if (returnFocus && trigger.current) trigger.current.focus({ preventScroll: true });
          else e.preventDefault();
        } else if (isTypeaheadKey(e)) {
          const t = typed.current;
          t.buffer = (e.timeStamp - t.at > TYPEAHEAD_RESET_MS ? "" : t.buffer) + e.key;
          t.at = e.timeStamp;
          const hit = typeahead(items.map(labelOf), i, t.buffer);
          if (hit >= 0) { e.preventDefault(); focusItem(items, hit); }
        }
      }}>
      {children}
    </div>
  );
}

/** Closes the menu after an item ran. */
function useSelect() {
  const { setOpen } = useMenu();
  return () => setOpen(false, "select");
}

type ItemProps = Omit<ComponentProps<"button">, "onSelect"> & {
  /** Runs on click, Enter or Space; call event.preventDefault() to keep the menu open. */
  onSelect?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** A second, muted line under the label. */
  description?: ReactNode;
  /** A right-aligned keyboard shortcut, e.g. "⌘S". */
  shortcut?: string;
  /** Destructive action, in the danger colour. */
  danger?: boolean;
  /** The text type-ahead matches when the label is not plain text. */
  textValue?: string;
};

function Item({
  onSelect, description, shortcut, danger, textValue, disabled, className = "", children, ...props
}: ItemProps) {
  const select = useSelect();
  // With a description, the label alone names the item and the
  // description describes it: each arrow press reads a short name.
  const id = useId();
  const split = !!description && !props["aria-label"];
  return (
    <button type="button" role="menuitem" tabIndex={-1}
      aria-labelledby={split ? `${id}-l` : undefined} aria-describedby={split ? `${id}-d` : undefined}
      {...props}
      aria-disabled={disabled || undefined}
      data-text={textValue ?? (typeof children === "string" ? children : undefined)}
      className={`menu-item${description ? " menu-item-2line" : ""}${danger ? " danger" : ""} ${className}`}
      onClick={(e) => {
        if (disabled) return;
        onSelect?.(e);
        if (!e.defaultPrevented) select();
      }}>
      <span id={`${id}-l`}>{children}</span>
      {description && <span id={`${id}-d`} className="menu-desc">{description}</span>}
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

/** A labelled run of items; the label is a 12px/600 muted heading. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="menu-group">
      <div id={id} className="menu-group-label">{label}</div>
      {children}
    </div>
  );
}

function Separator() {
  return <div role="separator" className="menu-sep" />;
}

interface RadioCtx { value: string | null; onValueChange: (v: string) => void }
const RadioContext = createContext<RadioCtx | null>(null);

/** Items of which one is checked (`menuitemradio`). Horizontal groups
 *  (a row of swatches) also move with left and right. */
function RadioGroup({ label, value, onValueChange, orientation = "vertical", className, children }: {
  label: string;
  value: string | null;
  onValueChange: (value: string) => void;
  orientation?: "vertical" | "horizontal";
  className?: string;
  children: ReactNode;
}) {
  const ctx = useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
  return (
    <RadioContext.Provider value={ctx}>
      <div role="group" aria-label={label} data-orientation={orientation} className={className}>
        {children}
      </div>
    </RadioContext.Provider>
  );
}

function RadioItem({ value, variant = "row", className = "", children, ...props }:
  Omit<ComponentProps<"button">, "value"> & {
    value: string;
    /** "row": a text item with a check mark; "swatch": a colour dot named by aria-label. */
    variant?: "row" | "swatch";
  }) {
  const radio = useContext(RadioContext);
  if (!radio) throw new Error("Menu.RadioItem must sit inside Menu.RadioGroup");
  const select = useSelect();
  const checked = radio.value === value;
  return (
    <button type="button" role="menuitemradio" tabIndex={-1} aria-checked={checked} {...props}
      data-text={typeof children === "string" ? children : undefined}
      className={`${variant === "swatch" ? "swatch" : "menu-item menu-radio"} ${className}`}
      onClick={() => {
        radio.onValueChange(value);
        select();
      }}>
      {variant === "row" && <>
        <span className="menu-check" aria-hidden="true">{checked ? "✓" : ""}</span>
        <span>{children}</span>
      </>}
    </button>
  );
}

Menu.Trigger = Trigger;
Menu.Content = Content;
Menu.Item = Item;
Menu.Group = Group;
Menu.Separator = Separator;
Menu.RadioGroup = RadioGroup;
Menu.RadioItem = RadioItem;

export default Menu;
