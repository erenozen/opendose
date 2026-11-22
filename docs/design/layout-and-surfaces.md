# Layout and surfaces

Source: [layout.css](../../web/src/styles/layout.css),
[cards.css](../../web/src/styles/cards.css), the elevation and radius
tokens in [tokens.css](../../web/src/styles/tokens.css). Direction:
DECISIONS section 2 ("Instrument") and ruling 6.

## Panes and seams

The workbench (`main.workspace`, FamilyWorkspace.tsx) is a set of tiled
panes (import, table, controls, plot, results, methods) on `--surface`,
divided by the splitters. The splitters are the seams: a 1px
`--line-solid` line with a ±4px hit area from `::before`, a 3px `--axis`
indicator on hover, drag or focus. Panes do not float: no shadow, no gap
of `--page` between them, no resize corner. A pane pads its content
`--space-12` `--space-16`; the blocks inside it (`.controls`,
`.result-card`, `.data-table`, `.plot-card`) lose their border there, and
two stacked blocks share a `--line` divider. Outside the workbench (info
sheets, empty states) a block keeps the 1px `--line` tile of cards.css.

The header is one 44px bar (52px on touch) on a 1px seam; the navigator
is a ruled sidebar pinned under it (`--header-h`, measured in Header.tsx,
also sets `scroll-padding-top`). Splitter and note drags write through
refs and CSS variables once per frame, never React state per move.

Inside a pane: section labels are `--text-label` (12px, 600, `--muted`)
in sentence case, never uppercase; padding is `--space-16`; groups sit
`--space-16` apart, related controls `--space-8`.

## Tabs and steppers

Use [ui/Tabs](../../web/src/components/ui/Tabs.tsx) for views of one
thing shown one at a time (the power tool's two modes): `Tabs`
(`value`, `onValueChange`), `Tabs.List` (always an `aria-label`),
`Tabs.Tab`, `Tabs.Panel`. Tab reaches the selected tab only; arrows,
Home and End move and select. The selected tab keeps the others' weight.
Never a `role="tablist"` by hand. Steps that build on each other (an
assay setup) are a wizard, not tabs: `sheets/assays/kit/Wizard.tsx`
shows a stepper, a "Step 2 of 4" heading that takes focus when a step is
picked, and one primary (Next, then the finish verb).

## One depth cue per surface

```
Does the surface hold or separate data (pane, table, grid, input, banner)?
 ├── Yes → a 1px border (--line-solid for seams and rules, --line-strong for
 │         control edges). No shadow.
 └── No: it floats above the page (menu, popover, dialog, toast, tooltip, drawer,
     floating note, the layout sheet's page)
      ├── Dialog or drawer → box-shadow: var(--elev-dialog)
      └── Everything else → box-shadow: var(--elev-float)
      In both: no border. The token already holds the 1px ring (and in dark
      mode the ring is white at 0.09, which is what separates the layer there).
```

Never a border plus a shadow, and never a shadow on a pane: two depth cues
read as a card on a card, and a shadow on data makes the grid look like it
floats. `--elev-seg` is for the segmented control's thumb only.

```css
/* Correct: components/menu.css:4 */
.sheet-menu {
  background: var(--float);
  border-radius: var(--radius-menu);
  box-shadow: var(--elev-float);
}

/* Incorrect: app/organise.css:12. Border, a 3px top rule and a shadow: three cues. */
.floating-note {
  border: 1px solid color-mix(in srgb, var(--note-edge) 55%, transparent);
  border-top: 3px solid var(--note-edge);
  box-shadow: var(--elev-float);
}
```

## Radius per role

Controls and panes 4px (`--radius-control`, `--radius-pane`), menus,
popovers and toasts 6px (`--radius-menu`), dialogs 8px
(`--radius-dialog`). Something inside a rounded container takes the next
step down (a menu item in a 6px menu is 4px), so corners stay concentric.
`--radius-round` is for the segmented control and status dots; never a
pill button (DECISIONS section 1 removed them).

## Widths

| Width | What changes (layout.css, Banner.css) |
| --- | --- |
| ≤ 1100px | the workbench is one column; the column splitter hides |
| ≤ 900px | the navigator leaves the grid |
| ≤ 760px | phone layout: panes stack in the order import, table, plot, controls, results, methods, each closed by a seam; the title moves into the drawer |
| ≤ 620px of banner | Banner actions wrap under the text (container query) |

Use a container query when a component's own width decides its layout
(Banner); use the breakpoints above only for the shell. Scripts read them
from `app/breakpoints.ts` (`BREAKPOINTS`, `DRAWER_QUERY`, `useMedia`);
never another literal 900 in a component. Wide tables
scroll inside their pane; the page never scrolls sideways at 390px.

## Phones and touch

- **Viewport.** `web/index.html` sets `viewport-fit=cover` and
  `interactive-widget=resizes-content`. Never change either.
- **Height.** `dvh` for full-height layouts, `svh` for a cap that must
  not jump when the URL bar moves. Never `100vh`: on iOS it is taller
  than the visible screen. design-counts counts it.
- **Safe areas.** Anything fixed to an edge adds the matching
  `--safe-*` token. Side padding uses `max(var(--space-24), var(--safe-left))`
  so content clears the notch in landscape.
- **Targets.** Every tap target is at least 44 x 44px on coarse pointers.
  Button does it: `md` grows to 44px, `sm` and IconButton get an invisible
  44px `::before`. A raw element needs the same `::before` pattern from
  Button.css.
- **Hover.** Every `:hover` rule sits inside
  `@media (hover: hover) and (pointer: fine)`, or a tap leaves it stuck on.
  design-counts counts ungated ones.
- **Text fields.** 16px on coarse pointers, enforced in base.css
  ([forms.md](forms.md#text-size-on-touch)).
- **Scrolling layers.** A menu, popover or dialog that scrolls sets
  `overscroll-behavior: contain`, so its end does not scroll the page.

```css
/* Correct: components/ui/Toast.css:11 */
right: calc(var(--space-16) + var(--safe-right));
bottom: calc(var(--space-16) + var(--safe-bottom));

/* Incorrect: a width rule for touch sizes, and 40px is under the floor.
   A tablet wider than 760px is as coarse as a phone (styles/controls.css
   now gates on pointer: coarse at 44px). */
@media (max-width: 760px) { button, select { min-height: 40px; } }
```
