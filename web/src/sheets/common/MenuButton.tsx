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
 * or a click outside close it, and focus returns to the button. The
 * trigger is a ghost Button, as commands inside a toolbar are (buttons.md).
 */
export default function MenuButton({ label, items }: {
  label: ReactNode;
  items: (MenuEntry | "sep")[];
}) {
  return (
    <span className="menu-wrap">
      <Menu>
        <Menu.Trigger className="btn btn--ghost">
          {label}<span className="caret" aria-hidden="true">▾</span>
        </Menu.Trigger>
        <Menu.Content>
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
