import { useState } from "react";
import Plotly from "plotly.js-dist-min";

// Export the current graph at an exact size, like Prism's "Export graph"
// dialog equivalent. Grabs the first rendered Plotly div on the page
// (each app mode shows a single graph).
export default function ExportPanel({ filename = "opendose-graph" }: {
  filename?: string;
}) {
  const [format, setFormat] = useState<"png" | "svg" | "jpeg" | "webp">("png");
  const [width, setWidth] = useState("800");
  const [height, setHeight] = useState("600");
  const [scale, setScale] = useState("2");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const target = document.querySelector<HTMLElement>(".plot .js-plotly-plot")
      ?? document.querySelector<HTMLElement>(".plot");
    if (!target) return;
    setBusy(true);
    try {
      // `scale` is supported at runtime but missing from DownloadImgopts
      await Plotly.downloadImage(target, {
        format,
        width: Math.max(Number(width) || 800, 100),
        height: Math.max(Number(height) || 600, 100),
        scale: format === "svg" ? 1 : Math.max(Number(scale) || 1, 0.1),
        filename,
      } as Parameters<typeof Plotly.downloadImage>[1]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-panel">
      <span className="export-title">Export graph</span>
      <label>
        <select value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}>
          <option value="png">PNG</option>
          <option value="svg">SVG (vector)</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
      <label>W
        <input inputMode="numeric" value={width}
          onChange={(e) => setWidth(e.target.value)} />
      </label>
      <label>H
        <input inputMode="numeric" value={height}
          onChange={(e) => setHeight(e.target.value)} />
      </label>
      {format !== "svg" && (
        <label>Scale
          <input inputMode="decimal" value={scale}
            onChange={(e) => setScale(e.target.value)} />
        </label>
      )}
      <button className="export-btn" onClick={download} disabled={busy}>
        <span className="swap-label" key={busy ? "busy" : "idle"}>
          {busy ? "Exporting…" : "Download"}
        </span>
      </button>
    </div>
  );
}
