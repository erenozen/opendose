# Forms

Source: [ui/Field.tsx](../../web/src/components/ui/Field.tsx),
[ui/NumberField.tsx](../../web/src/components/ui/NumberField.tsx),
[ui/Field.validation.ts](../../web/src/components/ui/Field.validation.ts),
[ui/Field.timing.ts](../../web/src/components/ui/Field.timing.ts). Import
from `components/ui`.

## Which control

```
Does the value hold one number (a dose, a seed, a count, a percentage)?
 ├── Yes → NumberField
 └── No
      ├── Free text on one line → Field + Input
      ├── One choice of 2 to 5, all worth seeing → <fieldset className="field-radios"> with radios
      ├── One choice of 6 or more → Field + <select>
      ├── On or off → <label className="check-row"><input type="checkbox"/> <span>…</span></label>
      └── A file → FileButton (buttons.md)
```

## Field

Use for every labelled text control. It wires the label's `htmlFor`, the
control's `id`, `aria-describedby` (description and error) and
`aria-invalid` from one generated id, so none of it is hand-written.
The alternative, a bare control with only `aria-label`, is for controls
whose label is already visible in a table header or a grid; everywhere
else the label is visible text.

Props: `label`, `description` (one line under the control, `--muted`
12px), `error` (the value's live problem, or null), `submitCount`, `id`,
`className`. Inside it, `Input` picks up the id, description, error and
blur timing. Any other control (a `<select>`) gets the same `id` as the
Field's `id` prop, and loses the automatic error wiring.

```tsx
// Correct: sheets/manipulate/SimulateDialog.tsx:112
<Field label="Table name">
  <Input value={name} onChange={(e) => setName(e.target.value)} />
</Field>
<Field label="Random seed" className="field-num" error={seedProblem} submitCount={attempts}>
  <Input inputMode="numeric" value={seed} placeholder="new" autoComplete="off"
    onChange={(e) => setSeed(e.target.value)} />
</Field>

// Incorrect: components/AnalysisPlanView.tsx:98. Hand-wired ids, a span
// for a label, no route for an error to reach a screen reader.
<label className="field" htmlFor={ids.out}><span>Primary outcome</span>
  <input id={ids.out} value={v.primaryOutcome} … /></label>
```

The `.field` label-wrapping pattern and the `Field` in
`sheets/common/clinicalKit.tsx` are older; new code uses `ui/Field`.

## NumberField

Use for every single-number entry. Never `<input type="number">`: it
reports an empty value for anything it cannot parse (a decimal comma, a
half-typed "1e-"), and the scroll wheel changes it while focused. NumberField types as text,
keeps the typed string, accepts a decimal comma, and steps by `step` on
Arrow Up and Down. Phones get the decimal pad only when `min` is 0 or
more; otherwise the text keyboard, because the iOS decimal pad has no
minus and no "e" (DECISIONS 7). Pass `min` whenever the value cannot be
negative. Grid value cells use the text keyboard for the same reason.

Props: `label`, `unit` (drawn inside the field's right edge: "µM", "%"),
`min`, `max`, `integer`, `required`, `step`, and either `value` +
`onValueChange` (controlled, a string) or `defaultValue`. Range and
whole-number problems come built in ("Enter 0 or more", "Enter a whole
number"); pass `error` only for a problem the field cannot see.

```tsx
// Correct: sheets/manipulate/SimulateForms.tsx:23
<NumberField label={label} value={value} readOnly={readOnly} fieldClassName="field-num"
  onValueChange={onChange} />

// Incorrect: report/estimation/panels.tsx:83. type="number", a label
// repeated in aria-label, and a blank silently becomes 5000.
<input type="number" aria-label="Bootstrap resamples" min={200} max={100000} step={1000}
  value={o.nBoot} onChange={(e) => set({ nBoot: Number(e.target.value) || 5000 })} />
```

## Validation timing

Reward early, punish late. Pass the live problem as `error` on every
render; Field decides when to show it:

1. While the user types a first attempt: hidden. An error after one
   keystroke scolds someone who has not finished.
2. On blur, or on a submit attempt (bump `submitCount`): shown.
3. From then on it follows every keystroke and clears the moment the value
   is valid.

For a problem that belongs to the whole form (a dialog's summary line),
call `useValidationTiming(problem, submitCount)` and put its `onBlur` on
the form's container. Never validate on a timer, never block typing, and
never clear what the user typed to "fix" it.

Error text says what to enter, not what went wrong: "Enter 0 or more",
not "Invalid value". Rules in [content.md](content.md).

## Text size on touch

On coarse pointers every text field, select and textarea is at least 16px
(`--text-input-min`). Below that, iOS zooms into the focused field and
never zooms back. base.css enforces it in the `touch-inputs` cascade layer
with `!important`, so no component rule can undercut it. Never set a
field's `font-size` below `--text-body-s` on fine pointers, and never
fight the layer on coarse ones.

## Autofocus

```
Did the user's last action ask to type into this field (Rename, Find, New name)?
 ├── Yes → focus it, on every pointer
 └── No
      ├── Is it the first field of a dialog? → nothing to do: Dialog focuses the first
      │    control on fine pointers and the dialog itself on touch
      ├── Should a different control get focus in a dialog? → <Dialog initialFocus={ref}>
      └── Anything else (page load, a pane appearing) → never autofocus
```

Never put `autoFocus` on a text input inside a dialog: React focuses it on
mount on every device, so on a phone the keyboard covers the dialog
before the user has read it. `Modal` has no `initialFocus`; order its
fields so the first is the one to type in, or use `Dialog` directly.

```tsx
// Incorrect: was components/DuplicateFamilyDialog.tsx
<input autoFocus value={name} onChange={(e) => setName(e.target.value)}
  onFocus={(e) => e.currentTarget.select()} />
```

## Submitting

`Dialog.Body` (and `Modal`) is a `<form>`: Enter in a field submits, and
the submit button is `<Button type="submit" variant="primary">`. Never
wire Enter by hand with `onKeyDown`. A long-running submit uses `busy`
(buttons.md), which also refuses a second submit.

## Leaving with unapplied edits

A long dialog whose edits apply only on Apply or Apply and close (the
graph format dialogs) asks "Discard your changes?" before Escape or a
press outside drops them: give its Modal `onClose={useDiscardGuard(dirty, onClose)}`
(`graph/useDiscardGuard.ts`). Cancel closes without asking, since
pressing it is the choice.
