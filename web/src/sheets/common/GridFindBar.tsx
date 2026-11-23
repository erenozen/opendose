// The find bar of a data table (Ctrl/Cmd+F in the grid, More › Find…, or
// the palette): a strip under the toolbar with the query, "2 of 5", the
// previous and next match and a close button. It is part of the pane, not
// an overlay, so the table stays usable while it is open. Matching is
// project/findInTable.ts.
import { useId, type RefObject } from "react";
import { IconButton, Input, Tooltip } from "../../components/ui";
import { CloseIcon } from "../../components/ui/feedbackIcons";
import { ArrowDownIcon, ArrowUpIcon } from "./gridIcons";

export default function GridFindBar({ inputRef, value, at, count, onValueChange, onStep, onClose }: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  /** Index of the match shown. */
  at: number;
  count: number;
  onValueChange: (v: string) => void;
  /** +1 next, -1 previous. */
  onStep: (dir: -1 | 1) => void;
  onClose: () => void;
}) {
  const typed = !!value.trim();
  const id = useId();
  return (
    <div className="grid-find" role="search" aria-label="Find in this table">
      <label className="grid-find-label" htmlFor={id}>Find</label>
      <Input ref={inputRef} id={id} type="search" className="grid-find-input"
        value={value} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onStep(e.shiftKey ? -1 : 1); }
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }} />
      <span className="grid-find-count" role="status">
        {typed ? (count ? `${Math.min(at, count - 1) + 1} of ${count}` : "No match") : ""}
      </span>
      <Tooltip content="Previous match" shortcut="Shift+Enter">
        <IconButton size="sm" aria-label="Previous match" disabled={!count}
          onClick={() => onStep(-1)}><ArrowUpIcon /></IconButton>
      </Tooltip>
      <Tooltip content="Next match" shortcut="Enter">
        <IconButton size="sm" aria-label="Next match" disabled={!count}
          onClick={() => onStep(1)}><ArrowDownIcon /></IconButton>
      </Tooltip>
      <Tooltip content="Close find" shortcut="Esc">
        <IconButton size="sm" aria-label="Close find" onClick={onClose}><CloseIcon /></IconButton>
      </Tooltip>
    </div>
  );
}
