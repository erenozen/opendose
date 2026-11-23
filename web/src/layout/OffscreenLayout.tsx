// A page layout drawn off screen for an export (PowerPoint, the export
// bundle): its graphs in their boxes at the page's size. exportPage
// (pageExport.ts) then composes the page from them, exactly as the layout
// sheet exports it; offscreenLegend.ts reads the master legend.
import type { RefObject } from "react";
import { pageDims, type ResolvedLayout } from "../project/layout";
import { findSheet } from "../project/ops";
import type { Project } from "../project/types";
import LiveGraph from "./LiveGraph";

const MM = 96 / 25.4;

/** The off-screen host of a layout page (portal it into the body). */
export function OffscreenLayout({ layout, project, hostRef }: {
  layout: ResolvedLayout;
  project: Project;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  const { w, h } = pageDims(layout.page);
  return (
    <div ref={hostRef} className="export-host" aria-hidden="true"
      style={{ width: w * MM, height: h * MM, display: "block" }}>
      {layout.items.map((it) => {
        if (it.kind !== "graph" || !it.graphId) return null;
        const g = findSheet(project, it.graphId);
        if (g?.kind !== "graph") return null;
        return (
          <div key={it.id} data-item-id={it.id} style={{ position: "absolute",
            left: it.x * MM, top: it.y * MM, width: it.w * MM, height: it.h * MM }}>
            <div className="layout-graph" style={{ position: "absolute", inset: 0,
              display: "flex", flexDirection: "column" }}>
              <LiveGraph graph={g} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
