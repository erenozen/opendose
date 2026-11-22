# OpenDose design system

OpenDose looks like an instrument: tiled panes meeting at 1px seams, calm
neutrals, dense type, and the data as the loudest thing on every screen.
The one accent is plot series 1's blue, so the app and the figures it
exports share a hue; it marks state (selection, the primary action,
links) and nothing else. Distinctiveness comes from typesetting numbers,
never from decoration.

Read this file before any UI work, then the topic file for the task.
Direction and its reasons live in [DECISIONS.md](DECISIONS.md) and the
binding rulings in [UI-UX-PLAN.md section 2](UI-UX-PLAN.md#2-decisions-that-settle-conflicts-between-skills).
These docs say how to apply them; they do not repeat them.

## The layer rule

```
Am I writing a value in a component (colour, size, space, radius, z-index, duration, curve)?
 ├── Is it scientific output (exported figure, plot palette, print sheet, a results number)?
 │    └── Yes → it is pinned; leave it as it is (ruling 10). See "Scientific output" below.
 ├── Does a token in web/src/styles/tokens.css name this role?
 │    └── Yes → var(--that-token). Never the raw value it resolves to.
 └── No token fits → stop. Add a semantic token to tokens.css (one light-dark() line),
      then use it. Never a literal in the component.
```

- Components read semantic tokens only (`--surface`, `--ink`, `--radius-menu`,
  `--dur-enter`). tokens.css is the only file that holds raw colour values.
  A literal elsewhere breaks dark mode silently, because every colour
  token switches theme through one `light-dark()` definition and a literal
  does not.
- Pick a token by role, not by look. `--accent` and `--info` resolve to
  the same colour today; use the one that names what you mean, because
  they will be retuned separately.
- UI goes through the primitives in `web/src/components/ui/`
  (one import: `import { Button, Field, notify } from "../components/ui"`).
  A hand-rolled button, dialog, menu, popover, banner or live region is
  drift, even when it looks right.

## Scientific output is not chrome

Exported figures, the classic graph theme, print CSS, plot palettes and
every results number keep their exact look and meaning (ruling 10).
Plotly and the exporters cannot read `oklch()` or custom properties, so:

- On-screen plot chrome comes from `SCREEN_CHROME_*` in
  [lib/chrome.ts](../../web/src/lib/chrome.ts), checked against tokens.css by
  `lib/__tests__/chrome.test.ts`. Retune a token, then update the hex there.
- Exports use `EXPORT_CHROME_*` from the same file. Pinned: never retune
  them, never point them at a token.
- `lib/palette.ts`, `graph/drawnColors.ts`, `app/print.css` and
  `lib/chrome.ts` are output files; design-counts reports their colours on
  a separate line, never as drift.

## Topic files

| File | Read it when you |
| --- | --- |
| [tokens.md](tokens.md) | pick a colour, text size, space, radius, z-index or duration |
| [buttons.md](buttons.md) | add any clickable action |
| [forms.md](forms.md) | add an input, a number field, validation or focus on open |
| [overlays.md](overlays.md) | show anything above the page: dialog, popover, menu, tooltip |
| [feedback.md](feedback.md) | tell the user something happened or is true |
| [motion.md](motion.md) | add or change a transition or animation |
| [layout-and-surfaces.md](layout-and-surfaces.md) | place a pane, choose border vs shadow, handle phones |
| [content.md](content.md) | write any string a user will read |

## Check your work

Run these from `web/` before handing back any UI change:

1. `node scripts/design-counts.mjs` (add `--list` for file:line). Every
   count must stay at or below main's: colour literals outside tokens.css,
   z-index and radius off the scale, `100vh`, ungated `:hover`,
   `transition: all`, raw font sizes. It does not count raw spacing or
   raw durations: check those by eye against tokens.md.
2. `node scripts/ui-stage.mjs http://localhost:<port>/ <OUT> "<scenes>"`
   on the scenes you touched (`--list` names them). It shoots 1400 and
   390 px, light and dark; open the PNGs with the Read tool.
3. axe: ui-stage writes `<OUT>/axe.json`. Zero violations on your scenes,
   both themes, both widths.
4. emil-ui-review on your diff; fix every Blocking and Should-fix finding.

Lint, build, unit and e2e commands are in the root README, section
"Develop". `scripts/verify.sh` runs all of them in a clean worktree.
