# OpenDose web app

The browser app: Vite 8, React 19 and TypeScript, plain CSS with
custom-property tokens, no UI library. Every analysis runs in the Python
engine (`../engine/opendose/`), which Pyodide loads into a Web Worker
(`src/boot.ts`). Nothing is sent to a server.

## Run it

```bash
npm ci
npm run dev          # http://localhost:5173/ (syncs the engine first)
npm run build        # type-check, then the production build in dist/
npm run lint         # oxlint
npm run test:unit    # node --test on src/**/__tests__/*.test.ts
```

`/?example=1` opens the example project directly. The e2e suites and
the stage harness below expect a dev server; warm it once by loading
`/?example=1` until the results say they are live, or the first suite
can catch Vite reloading the page mid-boot.

## How the engine gets here

`npm run dev` and `npm run build` run two sync scripts first:

- `scripts/sync-py.mjs` copies `../engine/opendose/*.py` into
  `public/py/opendose/` with a `bundle.json` the worker loads in one
  request. Edit the engine in `engine/`, never in `public/py/`. The
  script skips unchanged files so a running dev server does not miss a
  change.
- `scripts/sync-pyodide.mjs` puts the Pyodide runtime, NumPy, SciPy and
  the .xlsx reader into `public/pyodide/` (about 31 MB), each checked
  against its SHA-256. The site serves them itself, so the page contacts
  no other server. Downloads are cached in `node_modules/.cache`; only
  the first run needs the network.

The engine's file hash goes into the bundle URL at build time
(`vite.config.ts`), so the offline cache never mixes an old engine with
new pages. After an engine change that moves the example's numbers,
regenerate the results shown before the engine loads:
`node scripts/gen-sample-results.mjs http://localhost:5173/`.

## Checks

Each e2e suite drives the real app in headless Chromium (Playwright),
finds controls by role and accessible name, and takes the dev server's
URL as its first argument (default `http://localhost:5173/`). Run them
one at a time: each boots its own engine.

| Script | What it checks |
| --- | --- |
| `e2e-check.mjs` | The main suite: default fit, plate import, every table type, Prism import, projects (save, open, undo, autosave), chains, editing, exports of data and results |
| `e2e-tiff.mjs` | TIFF export, parsed back byte by byte (`--no-deflate` tests the uncompressed path) |
| `e2e-export.mjs` | Page layouts, PDF, PNG and PowerPoint export, citation, Copy for Word |
| `e2e-share.mjs` | Share links, the export bundle, import recipes, Apply to new data, the validation and privacy pages |
| `e2e-figures.mjs` | SuperPlots, legends, P-value styles, the classic theme, the colour-vision check, volcano plots, censor marks |
| `e2e-assays.mjs` | Every assay wizard, against numbers the engine computes natively |
| `e2e-feedback.mjs` | Toasts, banners, the announcer, the engine boot slot, a busy button and late validation |
| `e2e-primitives.mjs` | Dialog, Popover, Menu and Tooltip from the keyboard: focus return, Tab staying inside, Home/End, type-ahead |
| `e2e-motion.mjs` | What animates, for how long, on which curve; keyboard and reduced-motion paths; the theme switch (`--frames DIR` saves slowed screenshots) |
| `e2e-privacy.mjs` | That no request carries the user's data; run against `npm run build` served by `scripts/serve-dist.mjs` (default `http://127.0.0.1:5300/`) |
| `a11y-audit.mjs` | axe-core on the controls of every analysis |

`../scripts/verify.sh` runs the engine tests, build, lint, unit tests and
all of the suites above against main in a clean worktree.

## Looking at the interface

- `node scripts/ui-stage.mjs <url> <OUT> ["scene,prefix-*"] [--jobs=N] [--motion]`
  stages every surface and hard state (engine booting or failed, a failed
  fit, a 40-column grid, 80-character names) from the fixture projects in
  `e2e-fixtures/stage/`. It writes `OUT/<scene>-<1400|390>-<light|dark>.png`,
  axe results in `OUT/axe.json` and a contact sheet in `OUT/index.html`.
  `--list` names the scenes. Motion is reduced unless you pass `--motion`.
- `node scripts/design-counts.mjs [--list]` counts design-token drift in
  `src/`: raw colours outside `styles/tokens.css`, z-indexes and radii
  off their scales, raw font sizes, `100vh`, ungated `:hover`,
  `transition: all`. No count may rise above main's.
- `node scripts/smoke-0.4.0.mjs <url> [OUT]` screenshots the 0.4.0 entry
  points with axe-core.

## Other scripts

- `serve-dist.mjs [port]` serves `dist/` the way the host does (gzip, no
  SPA fallback), for measuring a production build.
- `validate-site.mjs <url>` drives a deployed site through the reference
  corpus in `../docs/validation/` and writes `results-site.json` and
  `.md` there (`--no-data` runs only the performance probe).
- `make-touch-icon.mjs` renders the PNG icons from `public/favicon.svg`.

## Design

Read `../docs/design/README.md` before changing anything a user can see.
It names the token, primitive and variant for each job; the topic files
next to it cover tokens, buttons, forms, overlays, feedback, motion,
layout and copy. Components use the tokens in `src/styles/tokens.css` and
the primitives in `src/components/ui/`.

## Where things are

- `src/app/`: project state, commands, autosave, file open.
- `src/components/`: the shell (header, navigator, workspace, results)
  and `ui/`, the primitives.
- `src/sheets/`: one folder per table type with its analyses and graphs;
  `src/sheets/README.md` says how a table type plugs in.
- `src/guide/`: first run, the tour, Help, the test and planning wizards.
- `src/graph/`, `src/layout/`, `src/export/`: graphs, page layouts and
  image export.
- `src/report/`: results sentences, legends, methods, checklists, history.
- `src/share/`: share links, the export bundle, recipes, Apply to new data.
