// Commands of the sharing package, callable from anywhere (header, sheet
// menus, info popover) without threading props: each dispatches a window
// event that <ShareHost> (mounted once in App) answers.
export const SHARE_EVENT = "opendose-share";

export type ShareRequest =
  | { kind: "link"; dataId?: string }      // share the project, or one family
  | { kind: "bundle" }                     // download the export bundle
  | { kind: "validation" };                // open the validation page

export function requestShare(req: ShareRequest): void {
  window.dispatchEvent(new CustomEvent<ShareRequest>(SHARE_EVENT, { detail: req }));
}

export const openShareLink = (dataId?: string) => requestShare({ kind: "link", dataId });
export const exportBundle = () => requestShare({ kind: "bundle" });
export const openValidation = () => requestShare({ kind: "validation" });
