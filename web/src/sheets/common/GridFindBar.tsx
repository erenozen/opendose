// The find bar of a data table (Ctrl/Cmd+F in the grid, More › Find…, or
// the palette): a strip under the toolbar with the query, "2 of 5", the
// previous and next match and a close button; Replace… (Ctrl+H, ⌘⇧H on a
// Mac, More › Replace…) opens a second row to replace the match shown or
// all of them, each as one undo step. It is part of the pane, not an
// overlay, so the table stays usable while it is open. Matching and
// replacing are project/findInTable.ts.
import { useId, type ReactNode, type RefObject } from "react";
import { Button, IconButton, Input, Tooltip } from "../../components/ui";
import { CloseIcon } from "../../components/ui/feedbackIcons";
import { ArrowDownIcon, ArrowUpIcon } from "./gridIcons";

export default function GridFindBar({ inputRef, value, at, count, replaceOpen, onValueChange, onStep,
  onToggleReplace, onClose, children }: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  /** Index of the match shown. */
  at: number;
  count: number;
  replaceOpen?: boolean;
  onValueChange: (v: string) => void;
  /** +1 next, -1 previous. */
  onStep: (dir: -1 | 1) => void;
  /** Shows or hides the replace row; absent on a read-only table. */
  onToggleReplace?: () => void;
  onClose: () => void;
  /** The replace row (GridReplaceRow), while it is open. */
  children?: ReactNode;
}) {
  const typed = !!value.trim();
  const id = useId();
  return (
    <div className="grid-find-bar" role="search" aria-label="Find in this table">
      <label className="grid-find-label" htmlFor={id}>Find</label>
      <div className="grid-find-row">
        <Input ref={inputRef} id={id} type="search" className="grid-find-input"
          value={value} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onStep(e.shiftKey ? -1 : 1); }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }} />
        <span className="grid-find-tools">
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
          {onToggleReplace && (
            <Button size="sm" variant="ghost" aria-expanded={!!replaceOpen} onClick={onToggleReplace}>
              Replace…</Button>
          )}
          <Tooltip content="Close find" shortcut="Esc">
            <IconButton size="sm" aria-label="Close find" onClick={onClose}><CloseIcon /></IconButton>
          </Tooltip>
        </span>
      </div>
      {replaceOpen && children}
    </div>
  );
}

/** The replace row of the find bar: the replacement, "Whole cell only",
 *  Replace (the match shown) and Replace all, and what the last replace
 *  did ("Replaced 7 cells."). */
export function GridReplaceRow({ value, whole, count, status, onValueChange, onWholeChange, onReplace,
  onReplaceAll, onClose }: {
  value: string;
  whole: boolean;
  count: number;
  /** What the last replace did, or "". */
  status: string;
  onValueChange: (v: string) => void;
  onWholeChange: (whole: boolean) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <>
      <label className="grid-find-label" htmlFor={id}>Replace with</label>
      <div className="grid-find-row grid-replace">
        <Input id={id} className="grid-find-input" value={value} placeholder="(empty cell)"
          spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (count) onReplace(); }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }} />
        <span className="grid-find-tools">
          <Button size="sm" disabled={!count} onClick={onReplace}>Replace</Button>
          <Button size="sm" disabled={!count} onClick={onReplaceAll}>Replace all</Button>
        </span>
        <label className="check-row grid-find-whole">
          <input type="checkbox" checked={whole} onChange={(e) => onWholeChange(e.target.checked)} />
          <span>Whole cell only</span>
        </label>
        <span className="grid-replace-status" role="status">{status}</span>
      </div>
    </>
  );
}
