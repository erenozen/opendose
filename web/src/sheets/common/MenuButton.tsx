import type { ReactNode } from "react";
import Menu from "../../components/ui/Menu";

export interface MenuEntry {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;          // right-aligned, e.g. a shortcut
  danger?: boolean;
}

/**
 * A toolbar button that opens a small menu of actions, on the Menu
 * primitive (ui/Menu): arrows, Home/End and type-ahead move, Escape, Tab
 * or a click outside close it, and focus returns to the button.
 */
export default function MenuButton({ label, items, align = "left", title }: {
  label: ReactNode;
  items: (MenuEntry | "sep")[];
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <span className="menu-wrap">
      <Menu>
        <Menu.Trigger title={title}>
          {label}<span className="caret" aria-hidden="true">▾</span>
        </Menu.Trigger>
        <Menu.Content className="grid-menu" align={align === "right" ? "end" : "start"}>
          {items.map((it, i) => it === "sep" ? (
            <Menu.Separator key={`sep${i}`} />
          ) : (
            <Menu.Item key={it.label} onSelect={it.onSelect} disabled={it.disabled}
              danger={it.danger} shortcut={it.hint}>
              {it.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu>
    </span>
  );
}
