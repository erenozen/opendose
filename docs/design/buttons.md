# Buttons

Source: [ui/Button.tsx](../../web/src/components/ui/Button.tsx),
[ui/IconButton.tsx](../../web/src/components/ui/IconButton.tsx),
[ui/Button.css](../../web/src/components/ui/Button.css). Import from
`components/ui`.

## Button

Use for any action. Something that goes to a URL is an `<a>`, not a
Button. An action that is a word inside a sentence of prose is a
`<button type="button" className="linkish" data-still>` (styled in
`components/ui/Button.css`, its one place), not a Button. A row never holds more than
four buttons: keep the four used most and put the rest behind one
[Menu](overlays.md#menu) (the grid toolbar rule, DECISIONS section 5),
because a fifth button wraps the row on a phone.

Variants: `primary`, `secondary`, `ghost`, `danger`. Nothing else exists:
an unlisted variant (`link`, `outline`, `danger-ghost`, `subtle`) is a
bug, not an option. Sizes: `md` (default) and `sm`. Nothing else exists.

- `secondary` is the default: a keycap, 1px inset `--line-strong`, no
  fill. Every standalone action that is not the one below.
- `primary`: the single most important action of a view. A view is a
  dialog, a banner, or a pane. One per view: two primaries means the view
  has no answer to "what do I do here?".
- `ghost`: no line, no fill. Commands inside a toolbar or a header bar
  only: a toolbar of keycaps reads as ten boxes, ghosts read as one bar.
  Banner and dialog actions are keycaps (`secondary`), never ghost.
- `danger`: filled red. Only the confirm button of a destructive or
  hard-to-undo action, inside the dialog that asks. The control that
  opens that dialog is not danger.
- `md` is 32px tall on a mouse and 44px on touch. `sm` is 26px, for
  banners, dense rows and slots; on touch it keeps its look and gets an
  invisible 44px hit area.

```
Does it navigate to a URL?
 ├── Yes → <a href>
 └── No
      ├── Is it a word inside a sentence? → <button className="linkish" data-still>
      ├── Is it the view's single most important action? → variant="primary"
      ├── Does it confirm a destructive or hard-to-undo action? → variant="danger"
      ├── Is it a command in a toolbar or the header bar? → variant="ghost"
      ├── Is its only content an icon? → IconButton (below)
      ├── Does it open the file picker? → FileButton (below)
      └── Default → variant="secondary" (omit the prop)
```

```tsx
// Correct: sheets/manipulate/SimulateDialog.tsx:92
<Button onClick={onClose}>Cancel</Button>
<Button type="submit" variant="primary" disabled={!engineReady} busy={running}
  busyLabel="Simulating…">
  {editing ? "Simulate" : "Create table"}
</Button>

// Incorrect: components/NewTableDialog.tsx:147. A raw button with a legacy
// class skips the press, busy, touch-size and variant rules of Button.
<button type="submit" className="btn-primary">Create table</button>
```

The old `.btn-primary` and `.btn-danger` classes no longer exist. Never
add a button class (`.foo-btn`) to restyle a Button.

### Busy and disabled

- Async work started by the button (engine call, file read, export) uses
  `busy` and `busyLabel`, the label saying what is happening
  ("Simulating…", "Forgetting…"). Busy keeps focus on the button and keeps
  its width (both labels share one grid cell), so nothing beside it moves.
- Never toggle `disabled` for busy: a disabled button drops keyboard focus
  to the page body.
- `disabled` only when the action cannot run at all, with the reason
  visible next to it ("The analysis engine is still loading…").

```tsx
// Correct: the same rule with the primitive
<Button variant="danger" busy={forget === "busy"} busyLabel="Forgetting…"
  onClick={() => { void forgetNow(); }}>Forget and close the project</Button>

// Incorrect: components/PreferencesPopover.tsx:225. disabled drops focus,
// and the label swap changes the button's width.
<button type="button" className="btn-danger" onClick={() => { void forgetNow(); }}
  disabled={forget === "busy"}>
  {forget === "busy" ? "Forgetting…" : "Forget and close the project"}
</button>
```

### Press feedback

Every enabled button scales to 0.97 on press (base.css, ruling 2). Never
add your own `:active` transform. Opt out with `data-still` on the button
or any ancestor, for: grid cells, menu items, segmented controls,
`linkish` buttons, drag grips. Rows inside a `data-still` container
darken on press on touch instead.

## IconButton

Use when the button's only content is an icon (dismiss, undo, settings).
If a word fits, use a Button with the word: an icon is a guess, a word is
not. `aria-label` is required by the type. Wrap it in a
[Tooltip](overlays.md#tooltip) to show its name and shortcut on hover.

Variants: the Button set; the default is `ghost`. Sizes: `md` (32px
square) and `sm` (26px square, 44px hit area on touch). An icon-only
`Menu.Trigger` or `Popover.Trigger` is not an IconButton: give it
`variant`, `size`, `aria-label` and `className="btn--icon"` (the only
class a trigger may take) and wrap it in a Tooltip.

```tsx
// Correct: components/ui/Banner.tsx:100
<IconButton size="sm" className="banner-dismiss" aria-label={dismissLabel}
  onClick={onDismiss}>
  <CloseIcon />
</IconButton>

// Incorrect: a raw button with a bespoke class (the header's old
// .theme-btn): no touch hit area, nothing forces the label.
<button className="theme-btn" aria-label="Undo" onClick={api.undo}><svg …/></button>
```

## FileButton

Use for "Open…" and "Import…": a real Button that opens the file picker,
keyboard reachable. Never a `<label>` around a hidden input, and never a
bare visible `<input type="file">` (its look and words come from the
browser). Takes every Button prop plus `accept`, `onFile(file)` (or `multiple` and `onFiles(files)`) and
`inputLabel` (the hidden input's name; e2e scripts set files on it).
Picking the same file twice fires twice.

```tsx
// Correct: components/TemplatePicker.tsx
<FileButton className="template-import" accept=".json,application/json"
  inputLabel="Import a template file" onFile={(f) => void onImport(f)}>
  Import template file…</FileButton>

// Incorrect: was share/ReplayDialog.tsx. The browser's own file control.
<input type="file" accept=".json,application/json" aria-label="Plan file"
  onChange={(e) => void loadPlan(e.target.files?.[0])} />
```

## Menu and popover triggers

`Menu.Trigger` and `Popover.Trigger` take `variant` and `size` and then
render as that Button (`buttonClass` in `ui/buttonClass.ts`): ghost in the
header or a toolbar (File, View), secondary for the bar's one keycap
(Analyze). Without `variant` they are plain buttons styled by an older
class (`.settings-btn`); give a new trigger a variant, never a class.
