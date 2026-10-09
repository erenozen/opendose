// Wording shared by the PowerPoint export entry points (kept apart from
// the dialog and the writer so the export strip does not load them).

/** The ungroup-to-edit step, shown under every PowerPoint export button.
 *  PowerPoint 2016 and later keep an SVG picture as a vector graphic and
 *  offer "Convert to Shape" on it; LibreOffice Impress offers "Break". */
export const PPTX_EDIT_HINT = "In PowerPoint 2016 or later, right-click a graph › Convert to Shape "
  + "(then Ungroup) to edit its text and lines; in LibreOffice Impress, right-click › Break.";
