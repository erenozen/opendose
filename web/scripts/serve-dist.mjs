// Serve the production build (web/dist) the way the host does: at the
// root, gzip for text and wasm, a 404 for missing files (no SPA
// fallback), short cache lifetimes. For measuring a real build locally:
//   npm run build && node scripts/serve-dist.mjs [port]
// then open http://localhost:<port>/.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");
const port = Number(process.argv[2] ?? 5300);
const BASE = "/";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".py": "text/x-python; charset=utf-8",
  ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const GZIP = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".py", ".wasm", ".txt",
  ".webmanifest"]);

// dist/_headers (copied from public/_headers), in Cloudflare's format: an
// unindented URL pattern ("*" matches anything), then indented
// "Name: value" lines; "#" starts a comment. The host consumes the file
// and never serves it, so neither does this server.
const HEADER_RULES = [];
const headersFile = join(root, "_headers");
if (existsSync(headersFile)) {
  for (const line of readFileSync(headersFile, "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const re = line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      HEADER_RULES.push({ match: new RegExp(`^${re}$`), headers: {} });
    } else if (HEADER_RULES.length) {
      const i = line.indexOf(":");
      if (i > 0) HEADER_RULES.at(-1).headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(root, rel));
  if (!file.startsWith(root) || rel === "_headers" || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    return;
  }
  const ext = extname(file);
  const headers = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "max-age=600",
  };
  for (const rule of HEADER_RULES) {
    if (rule.match.test(url.pathname)) Object.assign(headers, rule.headers);
  }
  const gz = GZIP.has(ext) && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
  if (gz) headers["Content-Encoding"] = "gzip";
  res.writeHead(200, headers);
  if (req.method === "HEAD") { res.end(); return; }
  const stream = createReadStream(file);
  (gz ? stream.pipe(createGzip()) : stream).pipe(res);
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}${BASE}`));
