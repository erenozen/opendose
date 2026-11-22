# Content

Every string a user reads: labels, buttons, menu items, titles, toasts,
banners, errors, empty states, tooltips. Code comments and commit
messages follow the same punctuation rules. Statistical wording is
scientific output (ruling 10): change its punctuation if you must, never
its meaning.

## Case

Sentence case everywhere: headings, dialog titles, buttons, menu items,
section labels, table heads, tab names. Capitalise only the first word
and proper names (OpenDose, Prism, Excel, Word, PowerPoint) and symbols
that are capitalised in the field (IC50, EC50, ANOVA, qPCR). Never
uppercase with CSS: `text-transform: uppercase` turns a label into a
shout and is no longer used for labels (DECISIONS section 1).

```css
/* Incorrect: styles/cards.css:15, still in the code */
.controls h3, .plate-import > .section-toggle, .result-card h4 {
  margin: 0; font-size: var(--text-label); text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--muted); font-weight: var(--weight-semibold);
}
/* Correct: the label role from tokens.md, sentence case in the markup */
font-size: var(--text-label); font-weight: var(--weight-semibold); color: var(--muted);
```

## Punctuation

- No em dashes. Use a colon to introduce, a comma or full stop to
  separate, parentheses for an aside. The one exception: a lone `—` in an
  otherwise empty table cell is the missing-value mark; keep it.
- `…` (one character, U+2026), never three dots: on a button or menu item
  that opens a dialog or asks for more input (`Help me choose…`), and on
  work in progress (`Opening “x”…`).
- Curly quotes around names the user chose: `“Assay 3”`, `“plate.pzfx”`.
- A toast or banner sentence ends with a full stop. A button, menu item,
  label or title does not.
- No exclamation marks. No "Oops", "Successfully", "Please".

```ts
// Incorrect: an em dash in a results sentence (was ResultsPanel.tsx:37)
`(${lo} to ${hi}) — about ${fold}x past ${edge}.`
// Correct: same meaning, a colon (ResultsPanel.tsx, extrapolationNote)
`(${lo} to ${hi}): about ${fold}x past ${edge}.`
```

## Buttons and menu items

A verb and its object: `Create table`, `Fit the curve`, `Import all`,
`Choose another file`. Never `OK`, `Submit`, `Yes`, `Continue` alone: the
user should be able to press the button without reading the dialog. A
confirm button repeats the verb of the question: the title `Delete
“Assay 3”?` gets the button `Delete`.

## Errors

An error says what failed, on what, why, and what to do next.

```
Could not <verb> “<object>”: <reason>. + an action with the next step
```

```ts
// Correct: app/useFileOpen.ts:96
notify(`Could not open “${file.name}”: ${e instanceof Error ? e.message : e}`, {
  tone: "error", id: TOAST_ID,
  action: { label: "Choose another file", onAction: () => pickRef.current() },
});

// Incorrect: no object, no next step (useAutosave.ts before phase 4).
notify(`Could not restore: ${e instanceof Error ? e.message : e}`, { tone: "error" });
```

- Field errors say what to enter, not what is wrong: `Enter 0 or more`,
  `Enter a whole number` (the wording in `Field.validation.ts`), never
  `Invalid value`.
- Never blame the user, never say "something went wrong", never show a
  raw stack or error code without a sentence before it.
- An empty state says what will appear and the one action that makes it
  appear. If the surrounding UI already says it, show nothing.

## Prism

Name Prism only to say what OpenDose reads: `Open a Prism file`, `The
Prism file has 3 data tables.` Never call OpenDose an alternative,
clone, replacement or equivalent of Prism, never claim parity, never
compare. Each of those implies an affiliation or a claim the project
does not make (README, "Trademarks & affiliation"). The code has no such
string today; keep it that way.

## Numbers

- Never re-format a number the engine returned: show the string the
  results formatters produce. Prism display-digit pins and the e2e
  suites assert on those exact digits.
- Data cells and result tables use `tabular-nums` (tokens.md). The
  headline figure keeps proportional figures.
- A number never breaks across lines: not at the e-notation hyphen
  (`1.04e-7`), not between a value and its unit (`31 MB`), not inside a
  range (`0.8 to 1.2`). In prose, wrap a value in `<Num>` or a whole
  sentence in `<NumText text={…} />` (`components/ui/Num.tsx`): each
  number, comparator (`P < 0.0001`) and range becomes a no-wrap span and
  the text is unchanged. Results tables align numbers right and keep them
  on one line themselves (`sheets/common/resultsTypeset.ts`).
- Units follow the number with a space (`9.4 of 31 MB`, `20 µM`).
- Ranges in words read `0.8 to 1.2`, not `0.8-1.2`: a hyphen next to
  negative numbers reads as a minus.

