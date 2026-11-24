# The OpenDose project file

An OpenDose project is one JSON file (`Save project` writes it, `Open`
reads it). This page says what is in it. The exact shape of every key is
in the JSON Schema next to it,
[project-file.schema.json](project-file.schema.json) (JSON Schema draft 7),
so any tool can check a file or read one without OpenDose.

## The promise

- Every file carries its format version (`"opendose_project": 2`).
- Every release opens every earlier version. Files of version 1 (the
  single-table app) are migrated on open into one data table with its
  results and graph.
- New keys are optional. A file saved before a key existed opens
  unchanged, and the schema lists such keys as optional.
- A file from a newer format version is refused with a message rather than
  read wrongly.

## Top level

| Key | Required | What it holds |
| --- | --- | --- |
| `opendose_project`, `version` | yes | Both `2`. |
| `title` | yes | The project's title. |
| `prefs` | yes | Preferences saved with the project: default table type, error bars, CI method, colour scheme, significant digits, P-value style, export settings. |
| `sheets` | yes | Every sheet, in navigator order (below). |
| `savedWith` | no | The app version, build and engine that saved the file. A later build that opens it recomputes the saved results and compares them. |
| `selected` | no | The id of the sheet on screen when the file was saved. |
| `groups` | no | Navigator groups of sheets. |
| `recipes` | no | Import recipes saved with the project. |
| `groupColors` | no | Colours pinned to group names. |
| `reproductions` | no | The reproduction checks of this project, newest last (at most 20): when it was opened (file, autosave or share link) in another build, which results were recomputed, how many numbers were compared and every number that changed, with both values. |

## Sheets

Every sheet has an `id`, a `kind` and a `name`; optional keys are
`frozen`, `highlight`, `groupId` and `floatingNotes`.

| `kind` | Holds |
| --- | --- |
| `data` | `table`: the table type, the X column, the data sets with their subcolumns and raw cells (strings, exactly as typed), excluded cells and their reasons, row titles. Optional: `derived` (a table computed by another analysis), `simulation`, `report` (reporting details). |
| `info` | Notes, constants, an optional analysis plan and an optional study design record (`design`: randomisation method and seed, blinding by stage, inclusion and exclusion criteria, the animals' sex, strain and age), for one table (`parentId`) or the project. |
| `results` | `parentId` (the data sheet), `analysis` (the analysis id) and its `options`. `cached` is the last computed result, written on save so a reopened file shows numbers before the engine has started; `cachedKey` is the fingerprint of the input it was computed from. `chosen` is the reason Help me choose gave for the test, with the options it set; it is shown while those options are unchanged. The reason is in the third-person wording of the methods paragraph (`guide/methodsWording.ts`); a file that saved the chooser's on-screen wording reads with the methods wording of the same outcome. `leftOut` lists values left out of this analysis only (a sensitivity analysis): each names a cell (`dataset`, `row`, `sub`, from 0), the `value` it held and the `reason` given. The analysis sees the table with those cells excluded, exactly as excluding them in the table would; the table and every other analysis keep them. A cell that no longer holds its `value` is not left out (the results say so). Files saved before it existed have none. |
| `graph` | The data sheet and results it draws, the graph type and its settings and format. |
| `layout` | A page layout: the page, the graphs and text placed on it, panel letters. |

Analysis `options`, cached results and some graph settings belong to the
analysis or graph that wrote them; the schema leaves them open.

## Share links and the autosave

A share link (`#p=…`) carries the same JSON without `prefs`, compressed
(raw DEFLATE, then base64url); a password-protected link (`#e=…`) carries
it encrypted. The autosave in your browser keeps the same JSON too. Both
record `savedWith`, so opening either in a later build checks the saved
results the way opening a file does.

An exercise link for teaching adds one top-level key, `exercise`: the
`task` the student reads and `hideTest` (whether the analyses' names,
settings and methods are withheld too). The project opens with its results
withheld until the student commits answers in Help me choose. The answer
is in the link all the same: the results are withheld in the app only, and
a build that does not know the key opens the link with everything shown.
Links without the key decode exactly as before; project files and the
autosave never carry it.

## How the schema is made and checked

The schema is generated from the TypeScript model
(`web/src/project/types.ts`, through `web/src/project/fileFormat.ts`) by
`node scripts/project-schema.mjs` (run from `web/`); never edit it by
hand. The unit suite (`npm run test:unit`) fails when the committed schema
differs from a fresh generation, and validates every project fixture in
`web/e2e-fixtures/` against it with ajv. The end-to-end suites validate
every project they save (`web/scripts/validate-project.mjs`).
