# Tokens

Source: [tokens.css](../../web/src/styles/tokens.css). There is no
primitive layer: every token is semantic and its raw value lives only
there. A raw `oklch()`, hex, px size or ms duration in a component is
drift (the layer rule in [README.md](README.md)).

## One definition per colour

Each colour token is one `light-dark(light, dark)` line; the theme comes
from `color-scheme` (the OS, or `data-theme` set by the pre-paint script
in `web/index.html` and `app/theme.ts`). Never write a
`[data-theme="dark"]` block or a `prefers-color-scheme` query for a
colour: a second definition lets OS-dark and toggled-dark drift apart. To
add a colour, add one `light-dark()` line and check both themes in ui-stage.

## Which background

```
Is it a floating layer (menu, popover, dialog, toast, tooltip)?
 ├── Yes → --float
 └── No
      ├── Is it a pane holding data or controls (table, controls, results, plot)? → --surface
      ├── Is it recessed: an input, a banner, a canvas well? → --inset
      ├── Is it behind the panes? → --page
      ├── Is it the selected or current item? → --accent-soft
      ├── Is it an error condition (Banner tone="error" does this)? → --danger-soft
      ├── Is it the view's one primary action? → --accent-fill, hover --accent-fill-hover
      ├── Is it a destructive confirm? → --danger-fill, hover --danger-fill-hover
      ├── Is it a segmented control? → --seg-track, thumb --seg-thumb
      └── Is it behind a modal? → --scrim (Dialog sets it; never set it yourself)
```

`--note-*` and `--hl-*` are user data (floating-note colours, navigator
highlight labels) and are the same hue in both themes. Never use them for
chrome.

## Which text colour

```
Is the text on a filled button?
 ├── On --accent-fill → --accent-ink
 ├── On --danger-fill → --danger-ink-on-fill
 └── No
      ├── Data, body copy, titles, input values → --ink
      ├── Secondary text in a row, a control's label → --ink-2
      ├── Captions, hints, section labels, table heads, units → --muted
      ├── Placeholder or a decorative glyph → --faint
      ├── A link, or the selected item's label → --accent
      ├── An error message or error icon → --danger
      ├── A warning message or icon → --warn-ink
      └── A success icon → --success
```

- `--faint` measures 3.9:1 on `--surface` in both themes (3.3:1 on
  `--page` light), below the 4.5:1 text floor. Never put words a user
  must read in it.
- `--line-control` measures 3.9:1 on `--surface` in both themes and
  3.4:1 on dark `--float`: an empty field is found by its edge alone.
- `--muted` is the lowest colour for readable text: 5.4:1 light, 6.9:1
  dark on every surface.
- `--warn` is a tint for badge backgrounds (`color-mix(in srgb, var(--warn) 18%, var(--surface))`).
  As text it fails contrast in light mode; use `--warn-ink`.
- Accent marks state only: selection, the primary action, links. Never
  use it for an icon, a heading, a hover colour or a decorative rule;
  if everything is blue, nothing reads as selected.
- `--role-time` colours the time column role in import previews. Nothing else.

## Which line

```
Is it the edge of a floating layer?
 ├── Yes → no border: --elev-float / --elev-dialog include a 1px ring
 └── No
      ├── A data separator: table rule, grid cell line, pane seam → --line-solid
      ├── The edge of a text field or select → --line-control (3:1, WCAG 1.4.11)
      ├── The edge of a keycap button, chip or toggle → --line-strong
      ├── A soft divider between sections inside one pane → --line
      ├── A plot gridline or axis → --grid / --axis (Plotly reads them via lib/chrome.ts)
      └── An invalid input's edge → --danger (Field sets it)
```

Focus is not a line you draw. base.css gives every `:focus-visible` a 2px
`--focus-ring` outline at 2px offset; `--focus-ring` is `--ink`, not the
accent, so "focused" never looks like "selected" (ruling 5: the ink ring
measures APCA Lc 91 or more on every surface). Never set `outline: none`
without drawing a replacement of the same strength.

## Type

Inter Variable, one closed scale named by role. Floor: 12px. Never write a
raw `font-size`.

| Token | Size | Role |
| --- | --- | --- |
| `--text-caption` | 12 | notes, hints, badges, field errors |
| `--text-label` | 12, weight 600, `--muted` | section labels, table heads (sentence case) |
| `--text-body-s` | 13 | dense UI: buttons, menus, fields, secondary text |
| `--text-body` | 14 | the body size (`body` sets it) |
| `--text-lead` | 16 | card titles |
| `--text-title` | 18 | dialog titles, the brand |
| `--text-heading` | 22 | page headings |
| `--text-figure` | 30 | the results headline number only; `--text-figure-quiet` (0.66 of it) when demoted |
| `--text-input-min` | 16px | text fields on coarse pointers (base.css applies it) |

Weights: `--weight-regular` 400, `--weight-medium` 500 (buttons, field
labels), `--weight-semibold` 600 (labels, titles, primary and danger
buttons), `--weight-bold` 700. Leading: `--leading-tight` 1.2 (buttons,
headings), `--leading-body` 1.45, `--leading-prose` 1.55 (sentences of
results). Data cells and result numbers use `font-variant-numeric:
tabular-nums`; the headline figure stays proportional (tabular figures
widen the e-notation hyphen). Slashed zero is not used: the shipped Inter
build ignores the `zero` feature.

## Space

4px base: `--space-2`, `-4`, `-6`, `-8`, `-12`, `-16`, `-20`, `-24`,
`-32`, `-40`, `-48`. Nothing else exists; 9, 10, 14 and 18px in older
rules are drift, rounded to a step when you touch the rule. Related
controls 8 apart, groups in a pane 16, pane padding 16.

## Radius

| Token | Value | Use on |
| --- | --- | --- |
| `--radius-control` | 4px | buttons, inputs, chips, tooltips, focus ring |
| `--radius-pane` | 4px | panes, banners, tables |
| `--radius-menu` | 6px | menus, popovers, toasts, floating notes |
| `--radius-dialog` | 8px | dialogs |
| `--radius-round` | 999px | the segmented control's track and thumb, status dots. Never a button. |

## Elevation

`--elev-float` (menus, popovers, toasts, tooltips, floating notes),
`--elev-dialog` (dialogs, the navigator drawer), `--elev-seg` (segmented
thumb only). Panes get none ([layout-and-surfaces.md](layout-and-surfaces.md)).

## Stacking

Dialog, Popover, Menu and Tooltip render in the browser's top layer and
need no z-index. Everything else uses the scale, lowest first:
`--z-base` 1, `--z-raised` 5 (floating notes), `--z-sticky` 10 (pinned
navigator), `--z-header` 20, `--z-drawer` 30 (its scrim one below),
`--z-popover` 40, `--z-dialog` 50, `--z-toast` 60, `--z-tooltip` 70.
Never a literal, never 9999: if two layers fight, one of them belongs in
the top layer.

## Motion and safe areas

`--dur-*` and `--ease-*`: which one when is in [motion.md](motion.md).
`--safe-top/right/bottom/left` wrap `env(safe-area-inset-*)`; anything
fixed to a screen edge adds the matching one
([layout-and-surfaces.md](layout-and-surfaces.md#phones-and-touch)).
