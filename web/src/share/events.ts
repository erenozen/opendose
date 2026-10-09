// Commands of the sharing package, callable from anywhere (header, sheet
// menus, info popover) without threading props: each dispatches a window
// event that <ShareHost> (mounted once in App) answers.
import type { PptxScope } from "../export/pptx";

export const SHARE_EVENT = "opendose-share";

export type ShareRequest =
  | { kind: "link"; dataId?: string }      // share the project, or one family
  | { kind: "bundle" }                     // download the export bundle
  | { kind: "pzfx"; dataId?: string }      // data tables as a .pzfx file (all, or one)
  | { kind: "validation"; scope?: ValidationFor }  // open the validation page
  | { kind: "pptx"; from?: string | null; scope?: PptxScope }  // graphs to PowerPoint
  | { kind: "replay"; dataId?: string };   // apply the project to new data

/** "How this is validated" on a results sheet: the page opens filtered to
 *  the checks of this analysis (share/validationIndex.ts). */
export interface ValidationFor { analysisId: string; options?: unknown }

export function requestShare(req: ShareRequest): void {
  window.dispatchEvent(new CustomEvent<ShareRequest>(SHARE_EVENT, { detail: req }));
}

export const openShareLink = (dataId?: string) => requestShare({ kind: "link", dataId });
export const exportBundle = () => requestShare({ kind: "bundle" });
export const exportPzfxFile = (dataId?: string) => requestShare({ kind: "pzfx", dataId });
export const openValidation = (scope?: ValidationFor) =>
  requestShare(scope ? { kind: "validation", scope } : { kind: "validation" });
/** "Export graphs to PowerPoint (.pptx)…" (export/PptxDialog). */
export const openPptxExport = (from?: string | null, scope?: PptxScope) =>
  requestShare({ kind: "pptx", from, scope });
/** "Apply to new data…" (share/ReplayDialog), optionally for one table. */
export const openReplay = (dataId?: string) => requestShare({ kind: "replay", dataId });
