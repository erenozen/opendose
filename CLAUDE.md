# OpenDose

## Design

Any change to `web/src` that someone can see (CSS, a component, a string)
is UI work. Before writing it:

1. Read `docs/design/README.md`, then the topic file for the task
   (tokens, buttons, forms, overlays, feedback, motion,
   layout-and-surfaces, content). They name the component and the
   variant to use; when they and your instinct disagree, they win,
   because they record decisions measured on real data.
2. Use only the semantic tokens in `web/src/styles/tokens.css` and the
   primitives in `web/src/components/ui/`. Never a raw colour, size,
   z-index or duration, a new variant, or a hand-rolled dialog, menu,
   popover, toast or banner: each one forks the system and breaks dark
   mode, touch sizes or focus return somewhere. If nothing fits, say so
   in your report instead of improvising.
3. Scientific output is not chrome: exported figures, plot palettes,
   `lib/chrome.ts` export values, print CSS and every results number keep
   their exact look and meaning, because papers and e2e pins depend on
   them.
4. Never edit `engine/` for a UI task. Never change the project data
   model (`web/src/project/types.ts`, the saved file) or add a feature the
   task did not ask for; if the task needs one, stop and say so.

Before hand-back, from `web/`: `node scripts/design-counts.mjs` (no count
above main's), `node scripts/ui-stage.mjs <url> <out> "<scenes>"` on the
scenes you touched (look at the PNGs), and zero axe violations in
`<out>/axe.json`.

## Develop

Commands for engine tests, the dev server, lint, unit and e2e suites are
in `README.md`, section "Develop"; `web/README.md` says what each script
in `web/scripts/` checks. `scripts/verify.sh` runs all of them against
main in a clean worktree.
