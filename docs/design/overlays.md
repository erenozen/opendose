# Overlays

Source: `web/src/components/ui/` Dialog.tsx, Popover.tsx, Menu.tsx,
Tooltip.tsx, all on useDismiss.ts. `components/Modal.tsx` and
`components/ConfirmDialog.tsx` wrap Dialog.

These four are the only overlays. Each renders in the top layer (no
z-index, no clipping by `overflow: hidden`), closes on Escape (topmost
only) and returns focus to its opener. Never build another: a hand-rolled
overlay re-implements all of that and gets one part wrong.

## Which overlay

```
Must the user finish or answer before going on (a form, a confirm)?
 ├── Yes → Dialog
 │    ├── Yes or no on one action → ui.confirm({ title, body, confirmLabel, danger })
 │    ├── Title, fields, actions → Modal
 │    └── Anything else (Trigger, initialFocus, uncontrolled) → Dialog parts
 └── No
      ├── A list of commands, or one choice from a set (theme, colour) → Menu
      ├── A context menu at the pointer → Menu with anchorPoint
      ├── Settings or detail tied to one control, used while the page stays visible → Popover
      ├── The name or shortcut of an icon-only button → Tooltip
      ├── A sentence or more of explanation → visible text, or a Popover. Never a Tooltip.
      └── A condition about a pane (read-only, restore, engine) → Banner (feedback.md)
```

## Dialog

Use when the page behind must wait; if the user should still see and use
the page, use a Popover. Parts: `Dialog.Body` (a `<form>`, `onSubmit`),
`Dialog.Title`, `Dialog.Actions`, `Dialog.Close` (a secondary Button),
`Dialog.Trigger`. `role` is `"dialog"` (default) or `"alertdialog"` for a
confirm that interrupts; nothing else exists. `instant` drops motion for
a dialog summoned by a shortcut. `initialFocus` takes a ref (fine
pointers only). Width: `.modal` 460px, `.modal-wide` 880px
(components/modal.css). Actions sit bottom right: Cancel (secondary)
first, the primary or danger submit last.

```tsx
// Correct: app/commands.ts:43, through ui.confirm and ConfirmDialog
const ok = await ui.confirm({
  title: `Delete “${s.name}”?`,
  body: "You can undo it.",
  confirmLabel: "Delete",
  danger: true,
});

// Incorrect: the usage comment in components/ui/Dialog.tsx:21. A raw
// legacy-class button; use <Button type="submit" variant="primary">.
<button type="submit" className="btn-primary">Rename</button>
```

## Popover

Use for settings or detail anchored to its trigger (graph settings,
export options, About). Commands go in a Menu; blocking goes in a Dialog.
Parts: `Popover.Trigger`, `Popover.Content` (`side` top/bottom/left/right,
`align` start/center/end, `collisionPadding`, always an `aria-label`),
`Popover.Close`. Focus moves in on open; Tab stays inside. The caller's
class sets `--float`, `--radius-menu` and `--elev-float`. A coach mark
(Tour.tsx) adds `anchor`, `anchorKey` and `closeOnOutsidePress={false}`.

```tsx
// Correct: components/ExportPanel.tsx:201
<Popover open={open} onOpenChange={setOpen}>
  <Popover.Trigger className="settings-btn">Options</Popover.Trigger>
  <Popover.Content className="export-pop" aria-label="Export options"
    side="bottom" align="end" collisionPadding={belowStickyHeader}>…</Popover.Content>
</Popover>

// Incorrect: components/Header.tsx:106. A hand-rolled panel with its own
// pointerdown and Escape listeners, guessing at other layers by class name.
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && !document.querySelector(".hdr-secondary .info-pop, .hdr-secondary .sheet-menu")) {
    setMoreOpen(false);
```

## Menu

Use for commands (Analyze, Save, sheet actions) and one choice from a
small set (`Menu.RadioGroup`); a list filtered by typing is a combobox
in a Popover (`components/ModelPicker.tsx`). Parts: `Menu.Trigger`, `Menu.Content`, `Menu.Item`
(`onSelect`, `description`, `shortcut`, `danger`), `Menu.Group`,
`Menu.Separator`, `Menu.RadioGroup` + `Menu.RadioItem`. Keys all work;
never add a key handler. An item that opens a dialog ends with "…".

```tsx
// Correct: components/Header.tsx:175
<Menu>
  <Menu.Trigger className="analyze-btn" disabled={…} title={…}>Analyze</Menu.Trigger>
  <Menu.Content className="analyze-menu" aria-label="Add an analysis">
    <Menu.Item onSelect={() => guide.openWizard()}
      description={`Which test? A few questions about ${data.name} …`}>Help me choose…</Menu.Item>
  </Menu.Content>
</Menu>

// Incorrect: App.tsx:156. One Button per Prism table: 12 tables put 14
// buttons in one banner. The single tables belong in a Menu ("Import one…").
{files.prismTables.map((t, i) => (
  <Button key={i} onClick={() => files.importTables([t])}>
    {t.title || `Table ${i + 1}`} ({t.table_type})
  </Button>
))}
```

## Tooltip

Use on icon-only buttons, to show the name and shortcut on hover and
keyboard focus. Everything else keeps visible text; a plain `title` stays
on text buttons that need a longer hint. The button's `aria-label` stays
its name, so the tooltip is never the only source. Opens after 500ms of
hover, at once on keyboard focus, and at once while warm (within 300ms of
another tooltip closing). Hidden on touch. Props: `content` (the name),
`shortcut`, `side`, `align`. Never put a link, a button or more than one
short line in it.

```tsx
// Correct: the Tooltip of components/Header.tsx:220, around the IconButton
// that buttons.md asks for in place of its raw button
<Tooltip content="Undo" shortcut={`${modKey}Z`}>
  <IconButton aria-label="Undo" disabled={!history.past.length} onClick={api.undo}>
    <svg …/>
  </IconButton>
</Tooltip>

// Incorrect: components/Navigator.tsx:661. The shortcut hides in a title
// attribute: invisible to keyboard and touch users.
<button type="button" className="nav-icon-btn" aria-label="Collapse all"
  title="Collapse all (−)" onClick={() => setAll(false)}>
```

## useDismiss

Only for a new primitive inside `components/ui/`; surfaces use the four
above. `useDismiss` (Escape on the topmost layer, press outside),
`usePresence` (keeps a closing layer mounted, sets `data-state`),
`restoreFocus`, `lastInputWasKeyboard()`, `coarsePointer()`.

## Keyboard-opened means instant

A layer opened by a key appears in the same frame (`data-instant`); one closed
by a key leaves at once. Never add an entrance that ignores `[data-instant]`.

## Not built yet

A shared combobox primitive (ModelPicker builds its own on Popover);
the navigator drawer at 900px and below as a modal Dialog (DECISIONS 5).
