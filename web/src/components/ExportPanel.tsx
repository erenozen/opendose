import { useState } from "react";
import type { ReactNode } from "react";
import Plotly from "plotly.js-dist-min";
import { encodeTiff } from "../lib/tiff";

type Format = "png" | "svg" | "jpeg" | "webp" | "tiff";

// Plotly's width/height are CSS pixels, i.e. 96 per inch; a TIFF asked
// for at 300 dpi is the same graph rendered 300/96 times larger.
const CSS_DPI = 96;
// Beyond roughly this, browsers refuse to allocate the canvas and the
// export fails with an opaque error. Better to say so up front.
const MAX_PIXELS = 60e6;
const MAX_SIDE = 16000;

// Export the current graph at an exact size, like Prism's "Export graph"
// dialog equivalent. Grabs the first rendered Plotly div on the page
// (each app mode shows a single graph).
export default function ExportPanel({
  filename = "opendose-graph", leading,
}: {
  filename?: string;
  /** Rendered at the start of the strip, so graph controls share one row. */
  leading?: ReactNode;
}) {
  const [format, setFormat] = useState<Format>("png");
  const [width, setWidth] = useState("800");
  const [height, setHeight] = useState("600");
  const [scale, setScale] = useState("2");
  const [dpi, setDpi] = useState("300");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const w = Math.max(Number(width) || 800, 100);
  const h = Math.max(Number(height) || 600, 100);
  const dpiValue = Math.min(Math.max(Number(dpi) || 300, 36), 2400);
  // Plotly floors the scaled canvas, so floor here too and the hint
  // matches the file to the pixel.
  const outW = Math.floor(w * dpiValue / CSS_DPI);
  const outH = Math.floor(h * dpiValue / CSS_DPI);

  const download = async () => {
    const target = document.querySelector<HTMLElement>(".plot.js-plotly-plot")
      ?? document.querySelector<HTMLElement>(".plot");
    if (!target) return;
    setErr("");
    if (format === "tiff"
      && (outW * outH > MAX_PIXELS || outW > MAX_SIDE || outH > MAX_SIDE)) {
      setErr(`${outW} × ${outH} px is too large to render. Lower the DPI or the size.`);
      return;
    }
    setBusy(true);
    try {
      if (format === "tiff") await downloadTiff(target);
      else {
        // `scale` is supported at runtime but missing from DownloadImgopts
        await Plotly.downloadImage(target, {
          format,
          width: w,
          height: h,
          scale: format === "svg" ? 1 : Math.max(Number(scale) || 1, 0.1),
          filename,
        } as Parameters<typeof Plotly.downloadImage>[1]);
      }
    } catch {
      setErr("Could not export the graph at that size. Try a smaller one.");
    } finally {
      setBusy(false);
    }
  };

  // No browser can encode TIFF, so render the graph as a PNG at the
  // requested resolution, read the pixels back, and write the TIFF here.
  const downloadTiff = async (target: HTMLElement) => {
    const dataUrl = await Plotly.toImage(target, {
      format: "png",
      width: w,
      height: h,
      scale: dpiValue / CSS_DPI,
    } as Parameters<typeof Plotly.toImage>[1]);

    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const blob = await encodeTiff(pixels, dpiValue);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.tif`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="export-panel">
      {leading}
      <span className="export-title">Export graph</span>
      <label>
        <select value={format}
          onChange={(e) => { setFormat(e.target.value as Format); setErr(""); }}>
          <option value="png">PNG</option>
          <option value="svg">SVG (vector)</option>
          <option value="tiff">TIFF (print)</option>
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
      {format === "tiff" && (
        <label>DPI
          <input inputMode="numeric" value={dpi}
            onChange={(e) => setDpi(e.target.value)} />
        </label>
      )}
      {format !== "svg" && format !== "tiff" && (
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
      {format === "tiff" && !err && (
        <span className="export-hint">
          {outW} × {outH} px, {(outW / dpiValue).toFixed(1)} × {(outH / dpiValue).toFixed(1)} in
        </span>
      )}
      {err && <span className="export-err" role="alert">{err}</span>}
    </div>
  );
}
