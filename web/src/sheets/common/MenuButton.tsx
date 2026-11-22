import type { ReactNode } from "react";
import Menu from "../../components/ui/Menu";

export interface MenuEntry {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;          // right-aligned, e.g. a shortcut
  /** A second line under the label: what the command does. */
  description?: string;
  danger?: boolean;
}

/**
 * A toolbar button that opens a small menu of actions, on the Menu
 * primitive (ui/Menu): arrows, Home/End and type-ahead move, Escape, Tab
 * or a click outside close it, and focus returns to the button.
 * `variant` gives the trigger the Button look (buttons.md): "ghost"
 * inside a toolbar; without it the trigger keeps its caller's class.
 */
export default function MenuButton({ label, items, align = "left", title, variant }: {
  label: ReactNode;
  items: (MenuEntry | "sep")[];
  align?: "left" | "right";
  title?: string;
  variant?: "ghost" | "secondary";
}) {
  return (
    <span className="menu-wrap">
      <Menu>
        <Menu.Trigger title={title} className={variant ? `btn btn--${variant}` : undefined}>
          {label}<span className="caret" aria-hidden="true">▾</span>
        </Menu.Trigger>
        <Menu.Content className="grid-menu" align={align === "right" ? "end" : "start"}>
          {items.map((it, i) => it === "sep" ? (
            <Menu.Separator key={`sep${i}`} />
          ) : (
            <Menu.Item key={it.label} onSelect={it.onSelect} disabled={it.disabled}
              danger={it.danger} shortcut={it.hint} description={it.description}>
              {it.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu>
    </span>
  );
}
