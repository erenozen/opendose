import { useRef, useState } from "react";
import { HIGHLIGHT_COLORS, type HighlightColor, type Sheet } from "../project/types";
import Menu, { type MenuCloseReason } from "./ui/Menu";

export interface MenuAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
}

/**
 * Popup menu for one sheet: actions plus a highlight-color row. Opens at a
 * point (right click, or under the row's ⋯ button), on the Menu primitive
 * (ui/Menu): arrows, Home/End and type-ahead move, left and right step
 * along the colour row. It plays its exit, then calls onClose; `refocus`
 * asks the navigator to focus the sheet's row again (after Escape or Tab,
 * a colour, or an action that left focus nowhere). Without a sheet
 * (section, group and note rows) it is a plain action menu named by `label`.
 */
export default function SheetMenu({ sheet, label, at, actions, onHighlight, onClose }: {
  sheet?: Sheet;
  label?: string;
  at: { x: number; y: number };
  actions: (MenuAction | "sep")[];
  onHighlight?: (c: HighlightColor | null) => void;
  onClose: (refocus: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  // A right click on another row while this menu fades out opens it again there.
  const [shownAt, setShownAt] = useState(at);
  if (shownAt !== at) {
    setShownAt(at);
    setOpen(true);
  }
  const reason = useRef<MenuCloseReason>("outside");

  // Once the menu is gone: the row takes focus back unless the user
  // clicked elsewhere or the action put focus somewhere (a rename field).
  const closed = () => {
    const a = document.activeElement;
    const lost = !a || a === document.body || !a.isConnected;
    onClose(reason.current !== "outside" && lost);
  };

  return (
    <Menu open={open} anchorPoint={at} returnFocus={false} onExitComplete={closed}
      onOpenChange={(o, why) => { if (!o) { reason.current = why; setOpen(false); } }}>
      <Menu.Content aria-label={`Actions for ${sheet?.name ?? label ?? "item"}`}
        sideOffset={0}>
        {actions.map((a, i) => a === "sep" ? (
          <Menu.Separator key={`sep${i}`} />
        ) : (
          <Menu.Item key={a.label} onSelect={a.run} disabled={a.disabled} danger={a.danger}
            shortcut={a.shortcut}>
            {a.label}
          </Menu.Item>
        ))}
        {sheet && onHighlight && <>
          <Menu.Separator />
          <Menu.RadioGroup label="Highlight color" orientation="horizontal" className="menu-colors"
            value={sheet.highlight ?? "none"}
            onValueChange={(v) => onHighlight(v === "none" ? null : v as HighlightColor)}>
            <Menu.RadioItem value="none" variant="swatch" aria-label="No highlight"
              className="swatch-none" />
            {HIGHLIGHT_COLORS.map((c) => (
              <Menu.RadioItem key={c} value={c} variant="swatch" aria-label={`Highlight ${c}`}
                className={`hl-${c}`} />
            ))}
          </Menu.RadioGroup>
        </>}
      </Menu.Content>
    </Menu>
  );
}
