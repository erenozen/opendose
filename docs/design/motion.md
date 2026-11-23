# Motion

Source: the motion tokens in
[tokens.css](../../web/src/styles/tokens.css), the press and
reduced-motion gates in [base.css](../../web/src/styles/base.css).
Rulings 1 to 4 of [UI-UX-PLAN.md section 2](UI-UX-PLAN.md#2-decisions-that-settle-conflicts-between-skills)
are binding; this file turns them into steps.

OpenDose is used for hours at a time. Motion says where something came
from and that a press landed. It never decorates and never makes anyone wait.

## Should it animate at all

```
Was it started from the keyboard?
 ├── Yes → no motion (data-instant). The fastest user must never wait.
 └── No
      ├── Is it the theme switching? → never animates (ruling 4)
      ├── Does it happen many times a minute (cell selection, typing, a value
      │    updating, sorting, switching sheets)? → no motion
      ├── Is it a layer appearing or leaving (popover, menu, dialog, toast, banner)?
      │    → enter and exit below
      ├── Is it a button press? → nothing to write: base.css does it
      └── Anything else → no motion, unless a reviewer can say what it explains
```

## Durations and curves

| What | Duration | Curve |
| --- | --- | --- |
| Hover and colour changes | `--dur-base` 160ms (hairline indicators: `--dur-fast` 120ms) | `--ease-out` |
| Press scale to 0.97 | `--dur-base` 160ms | `--ease-out` |
| Tooltip in (it leaves at once: the next one in a toolbar opens instantly, so an exit would show two) | `--dur-fast` 120ms | `--ease-out` |
| Layer enters | `--dur-enter` 200ms | `--ease-out` |
| Layer exits | `--dur-exit` 150ms | `--ease-out` |
| Drawer or sheet slides in / out | `--dur-drawer` 260ms / `--dur-drawer-exit` 200ms | `--ease-drawer` |
| Something on screen moves or morphs (segmented thumb, tour ring and card) | `--dur-enter` 200ms | `--ease-in-out` |
| The second piece of a two-beat entrance waits | `--dur-stagger` 80ms (0 with reduced motion) | |
| A spinner turns | its own loop | `linear` |

- Never `ease-in` (ruling 3): it starts slow, exactly when the user is
  watching for a response. Never the CSS keywords `ease` or `ease-in-out`
  either: use the tokens.
- Exits are 20 to 30% faster than entrances (150 vs 200ms, 200 vs 260ms
  for the drawer): the user has already moved on.
- Nothing in the interface runs longer than 260ms. Never write a raw
  duration; if no token fits, the motion is wrong, not the scale.

## Enter and exit

- Animate `transform` and `opacity` only. Never `width`, `height`,
  `top`, `left`, `margin` or `padding`: they relayout every frame.
- Anchored layers (Popover, Menu, Tooltip) scale from 0.97 plus a fade,
  from `--ui-origin` (the side of the trigger). Dialogs scale from 0.97 at
  the centre with the backdrop fading on the same curve and duration.
  Toasts rise 16px; banners drop 6px. Never scale from 0: nothing real
  appears from a point.
- A mounting element enters with `@starting-style`, not a keyframe.
  Keyframes only where `@starting-style` cannot fire (an opening
  `<details>`).
- When a banner leaves, the content below closes the gap at once. Never
  animate height.
- A layer that is not a primitive but leaves (the help panel) stays
  mounted through `usePresence` (ui/useDismiss.ts) with `data-state`,
  inert while it fades; a keyboard close removes it at once.
- Something already on screen that moves to a new place (the segmented
  thumb, the tour ring and card) glides only after a pointer press on the
  control that moves it. A key press, a table switch, a resize, the font
  swap and the first paint move it at once. Where the shape changes size,
  cut a full layer with `clip-path` (`inset()` for the thumb, `path()`
  for the tour's dim and ring) instead of scaling it: a scale distorts the
  border and radius, and width or height relayout every frame. A clip
  also cuts a box-shadow, so give a clipped surface its depth with
  `filter: drop-shadow(...)` on a wrapper (header.css `.seg-thumb`).
- The primitives already do all of this. Writing an entrance yourself
  means you are building an overlay that should be a primitive.

```css
/* Correct: components/ui/Banner.css:9 */
.banner {
  opacity: 1; transform: translateY(0);
  transition: opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out);
  @starting-style { opacity: 0; transform: translateY(-6px); }
}
.banner[data-closing] { opacity: 0; transform: translateY(-6px); transition-duration: var(--dur-exit); }

/* Incorrect: the old tour ring (was guide/guide.css). Layout properties, a raw duration. */
transition: top 220ms var(--ease-out), left 220ms var(--ease-out),
  width 220ms var(--ease-out), height 220ms var(--ease-out);
```

## Press feedback

Every enabled `<button>` scales to 0.97 while pressed (ruling 2), from
one rule in base.css. Never write another `:active` transform. Opt out
with `data-still` on the button or an ancestor; use it for grid cells,
menu items, segmented controls, `linkish` buttons and drag grips, where a
moving target makes repeated or precise presses worse. A busy Button does
not scale.

## The theme switch

`app/theme.ts` adds `.no-transitions` to the root for the swap and removes
it after the next paint, so every colour changes in one frame. Never add a
transition on `background`, `color` or `border-color` to `body`, `html`
or `:root`; never remove the class early.

## Reduced motion

"Gentler, not zero" (ruling 1). Under `prefers-reduced-motion: reduce`:

- base.css limits `transition-property` to opacity and colours, so
  movement and scale apply at once while the fade still plays. You get
  this for free when you transition with the tokens. `clip-path` is not
  on the list either, so clip glides jump. `outline-color` is kept off it
  so a focus ring moved by the keyboard still lands at once.
- A surface whose only motion is a slide fades in place instead: the
  phone drawer sets `transform: none` and fades on opacity with its scrim
  (navigator.css). Never leave a surface that just pops.
- tokens.css shortens `--dur-enter` to 150ms, `--dur-exit` and
  `--dur-base` to 120ms, `--dur-drawer` to 150ms, `--dur-drawer-exit`
  to 120ms, and `--dur-stagger` to 0.
- A WAAPI move (the tour card) checks `prefersReducedMotion()` and does
  not start.
- Every keyframe entrance you write switches to `fade-in` under reduce;
  every infinite loop stops (`animation: none`), with the words carrying
  the state.

```css
/* Correct: styles/controls.css */
.advanced[open] > section { animation: disclose var(--dur-enter) var(--ease-out); }
@media (prefers-reduced-motion: reduce) {
  .advanced[open] > section { animation-name: fade-in; }
}
/* Correct: components/ui/Toast.css:70 */
@media (prefers-reduced-motion: reduce) { .tone-spinner { animation: none; } }
```

Never use `0.01ms !important` or `animation: none` on everything: a fade
is how a reduced-motion user sees that something changed.

## Checking motion

`web/scripts/e2e-motion.mjs` reads `document.getAnimations()` on these
surfaces (what runs, on which property, for how long, on which curve) and
checks keyboard opens, reduced motion and the theme toggle. Add a check
there when you add motion. To see a transition frame by frame, slow the
page with CDP `Animation.setPlaybackRate` (0.1) and screenshot it
mid-flight; in slow motion `usePresence` cuts held exits at its 400ms cap.
