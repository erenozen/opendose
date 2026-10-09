# Raw image provenance: a design note

Need `raw-image-provenance` (rank 80, score 40.6, 11 observations from 6
venues; Wave 4, research only). Plan item 35: "Keep the raw, uncropped image
and every adjustment linked to the numbers". Acceptance test in the plan: *A
user exporting a densitometry figure gets the uncropped blot with lane labels
as a supplementary panel from the same project.*

This note is research only: no code. It proposes a design that keeps
OpenDose browser-only, lists what stays out, prices the storage, and ends
with open questions for Eren and a recommendation.

## 1. What users asked for

The observations are about losing the link between the picture and the
numbers: an adjustment made in the image editor that changes the band, a
crop that loses the calibration, a control and a target on two images with
different settings. Five of the eleven, verbatim (needs.json):

> Fighting #ImageJ today. It's losing greyscale calibration when I crop a
> section from a larger image.
>
> [8bitorbust.info, 2025-10, Senior Lecturer in Imaging & Calcified Tissues](https://8bitorbust.info/@dtl/115315620267316809)

> What if they don't all touch the bottom when you graph it? Thats the issue
> I'm having, and if I play with the white balance more one of my lanes
> disappears entirely
>
> [youtube.com, 2025-10, comment on a densitometry tutorial](https://www.youtube.com/watch?v=ZJaD_6C5nkQ&lc=UgzC6F8waCs3I17JP4x4AaABAg)

> If my control protein and protein of interest are in seperate images will
> the contrast settings affect the result?
>
> [youtube.com, 2023-10](https://www.youtube.com/watch?v=ZJaD_6C5nkQ&lc=UgwppK7UlQ0JekIV-pt4AaABAg)

> I observed that some faint bands were entirely eliminated due to the
> adjustments of brightness/contract; how can you account for the bands.
>
> [youtube.com, 2023-10](https://www.youtube.com/watch?v=ZJaD_6C5nkQ&lc=UgwQZZ6CK08E5GhHSBd4AaABAg)

> We should have cameras that can establish that published images have not
> been modified (or at least provide raw and adjusted pairs
>
> [news.ycombinator.com, 2024-09](https://news.ycombinator.com/item?id=41680329)

A sixth, from a cell biologist working in Fiji, shows how easily a step in
the image editor changes what is measured: "I rotated and cropped them in
FIJI and added scale bars. The scale bar on one of the images is longer than
the others." ([qoto.org, 2025-05](https://qoto.org/@Drosmel/114440041699396307))

The common thread is not a missing image editor; it is that the numbers in
the statistics tool carry no record of which image, which crop and which
adjustment they came from, so neither the user nor a reviewer can check them.

## 2. What journals require

From the catalogue's journal-requirements corpus (the quotes are in
needs.json under `raw-image-provenance`, `wb-densitometry-workflow` and
`source-data-export`):

- **eLife**: "we require that both (1) the original files of the full raw
  unedited gels or blots and (2) figures with the uncropped gels or blots
  with the relevant bands clearly labelled be provided."
  ([author guide](https://reviewer.elifesciences.org/author-guide/full))
- **Nature Portfolio**: "All life science papers published in Nature
  Portfolio journals require submission of unprocessed original images of
  gels and western blots to be submitted with the final accepted version."
  and "Processing (such as changing brightness and contrast) is appropriate
  only when it is applied equally across the entire image and is applied
  equally to controls. Contrast should not be adjusted so that data
  disappear." ([image integrity policy](https://www.nature.com/nature-portfolio/editorial-policies/image-integrity))
- **Nature Communications** (source data): "The source data file should, as
  a minimum, contain the numerical data underlying any graphs and charts, and
  uncropped versions of any gels or blots presented in the figures."
  ([how to submit](https://www.nature.com/ncomms/submit/how-to-submit))
- **PLOS ONE**: "If any concerns arise about the availability of the
  original blot or gel images or compliance with the figure preparation
  guidelines (see below), the submission will be placed on hold while this
  is resolved." ([figures](https://journals.plos.org/plosone/s/figures))
- **Journal of Cell Biology**: "Nonlinear adjustments (e.g., changes to
  gamma settings) must be disclosed in" the figure legend
  ([Rossner & Yamada 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2172141/)).

So the deliverable a journal asks for is concrete: the uncropped original,
lanes labelled, next to the numbers, with any adjustment disclosed. That is
an export problem, which OpenDose already solves for tables and figures (the
export bundle), plus a link from the densitometry table to its image.

## 3. Design (browser-only)

### 3.1 An image attached to a densitometry table

The densitometry assay (`web/src/sheets/assays/densitometry`) already reads
ImageJ / Image Lab exports into a table of lanes. The proposal adds an
optional **source image** to that data sheet:

- **Attach image…** on the densitometry wizard's first step and in the data
  sheet's aside: a file picker (PNG and JPEG through a plain `<img>`; TIFF
  needs a decoder, see question 3: OpenDose writes TIFF in
  `lib/tiff.ts` but does not read it). Nothing is uploaded: the file is read
  with `File.arrayBuffer()` in the page.
- **What is stored in the project**: a **thumbnail** (longest side 1200 px,
  WebP or PNG, 8-bit greyscale when the source is greyscale) as a data URI
  in a new optional field of the data sheet, `sourceImage: { thumb,
  width, height, name, sha256, bytes, mime, addedAt, lanes, note }`, with a
  hard cap (proposed 300 kB after encoding; the attach step downsizes until
  it fits and says so). `sha256` is the SHA-256 of the **original file**
  (Web Crypto `crypto.subtle.digest`), so a reviewer can check that the file
  sent to the journal is the one that was quantified.
- **The full-resolution file is optional and stays in this browser**: kept
  in IndexedDB (the store autosave already opens, `project/autosave.ts`) under
  its hash, never in the project file and never in a share link. The sheet
  says "Original kept in this browser only (12.4 MB); download it from here
  or attach it again on another computer". When the hash is not found
  locally, the sheet shows the thumbnail and "Original not on this computer".
- **Lane labels mapped to rows**: on the thumbnail the user drags one
  vertical marker per lane (or types the lane count and the outer edges;
  lanes evenly spaced). Each marker is bound to a row of the densitometry
  table (default: in order; editable). The binding is stored as
  `lanes: [{ x0, x1, row }]` in thumbnail coordinates. The labels drawn are
  the table's row titles, so renaming a lane in the table renames it on the
  image.
- **Adjustments are recorded, not performed**: a short structured note
  ("Brightness/contrast applied to the whole image in Image Lab 6.1: yes /
  no; nonlinear (gamma): no; cropped from the original: no") filled in at
  attach time, written into the methods text and the figure legend ("The
  uncropped blot is shown in Supplementary Figure S1; no nonlinear
  adjustments were made"), following the JCB and Nature wording above.

### 3.2 Export with the figure

- **Graph export**: the densitometry bar graph gets an option "Add the
  uncropped blot as a panel": the thumbnail (or the original, when it is in
  this browser) drawn above or beside the graph with the lane labels, through
  the existing figure composition (`export/compose.ts`), so a PNG / PDF /
  SVG export carries both.
- **Export bundle** (`share/bundle.ts`): a `supplementary/` folder with, per
  densitometry table, `<table>-blot-uncropped.png` (the labelled thumbnail),
  the original file when it is in this browser (else a line in the README:
  "original not included: kept on the computer it was attached on, SHA-256
  …"), and `<table>-lanes.csv` (lane, row title, x range, the band values).
  The README lists the hash of every original.
- **Provenance** (`report/provenance.ts`) gains the image's name, size,
  hash and the adjustment note, so the analysis record says which picture
  the numbers came from.

### 3.3 What stays out

- **Image processing**: no band detection, background subtraction, rolling
  ball, lane profiles, rotation or contrast tools. ImageJ / Fiji and Image
  Lab do that, users already trust them, and the catalogue's evidence is
  about provenance, not about a better densitometry algorithm. OpenDose reads
  their exports (as it does now) and keeps the picture next to the numbers.
- **Editing the image**: the thumbnail is never altered except for the
  downsizing that makes it fit, which is stated on the sheet.
- **Microscopy images and z-stacks**: out of scope; only gels and blots.
- **Uploads, accounts, cloud storage**: none. The architecture rule holds:
  everything is in the browser and in files the user saves.

## 4. Storage cost

| Where | Today | With the proposal |
|---|---|---|
| Project file (`.opendose.json`) | a densitometry family is a few kB | + up to 300 kB per attached image (thumbnail as a data URI, base64 adds a third). Ten blots: about 3 MB, still an ordinary file to save and e-mail. |
| Autosave (IndexedDB, localStorage fallback) | the project JSON | the same JSON (with thumbnails); localStorage's ~5 MB quota can be reached with many blots, so autosave should skip thumbnails in the localStorage fallback and say so. |
| Original files | not stored | IndexedDB only, opt-in, per browser; a 16-bit TIFF from a ChemiDoc is typically 5-30 MB. The browser may evict it under storage pressure unless `navigator.storage.persist()` is granted; the UI must say the original is a convenience copy, not the archive. |
| Share links | 64 kB limit (`share/link.ts` `SHARE_LIMIT`) | **Images cannot go in share links**: a single thumbnail is several times the limit. Share links drop `sourceImage` (keeping name, hash and lane labels) and the receiving page says "image not included in links; open the project file". |
| Export bundle | tables, results, graphs, methods | + the labelled thumbnail and, when present locally, the original: the bundle can grow to tens of MB; it is generated on demand in the browser (fflate), which handles that size. |

## 5. Open questions for Eren

1. **Thumbnail cap**: 300 kB per image is a guess. Is a project file of a
   few MB acceptable, or should thumbnails be opt-in per table?
2. **Original in the project**: should there be an explicit "embed the
   original in the project file" switch (for a lab that wants one archive
   file), with a size warning, or never?
3. **TIFF decoding**: 16-bit greyscale TIFFs need a decoder; OpenDose only
   writes TIFF (`lib/tiff.ts`). Is a small decoder loaded on demand (an
   open-source library of a few tens of kB, or a minimal baseline-TIFF reader
   written here) acceptable, or should the attach step accept PNG / JPEG only
   and ask users to export a PNG from Image Lab?
4. **Lane mapping UI**: drag markers on the thumbnail (more work, more
   accessible with keyboard handles) or "number of lanes + edges" (simple,
   enough for evenly spaced gels)? The second is proposed first.
5. **Scope beyond blots**: gels and dot blots share the design; should
   plate images (ELISA, colony counts) be included later?
6. **Hash**: is SHA-256 of the original enough as the integrity statement,
   or do labs want a signed note (date, user name)? A signature implies
   accounts or keys, which the architecture excludes.

## 6. Recommendation

**Build, after Wave 3, as a small focused item (effort M, about 3-4 days),
in this order:**

1. Attach image + thumbnail + hash + adjustment note on the densitometry
   data sheet, stored in the project; share links drop it (1.5 days).
2. Lane count / edges mapping to table rows and the labelled thumbnail
   (1 day).
3. Export: the uncropped labelled blot as a supplementary file in the export
   bundle, the hash in the README and provenance, the adjustment note in the
   methods text and legend (1 day).
4. Optional, later: keeping the original in IndexedDB, and the graph-export
   panel that composes the blot with the bar graph (1 day).

It meets the acceptance test with steps 1-3 and touches no statistics. The
evidence is modest (11 observations) but the requirement is binary for
authors: several journals hold a submission without the uncropped originals,
and today OpenDose users must assemble that panel by hand in another tool.
Deferring is reasonable only if the project-file size (question 1) is judged
too costly; in that case ship step 3 alone with the image kept outside the
project (the bundle README pointing to the file by name and hash).
