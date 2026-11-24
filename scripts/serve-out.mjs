// A minimal static server for the production export — the e2e tests point
// Playwright's webServer at it, so the suite exercises the same files GitHub
// Pages would ship. No dependencies: the export is a plain directory of
// files, the only care is content types, a "/" default and — like GitHub
// Pages' CDN — byte ranges, which a media element asks for.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";

const root = resolve(fileURLToPath(new URL("../out/", import.meta.url)));
const port = Number(process.argv[2] ?? 3111);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

// "bytes=start-end", "bytes=start-" and "bytes=-suffix" — the single-range
// forms browsers send. null: no usable range, serve the whole file.
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }
  if (match[1] === "") {
    return { start: Math.max(size - Number(match[2]), 0), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  return { start, end };
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = decodeURIComponent(url.pathname).replace(/^([/\\])+/, "");
    if (path === "" || path.endsWith("/")) {
      path += "index.html";
    }
    const target = resolve(join(root, path));
    // A request must stay inside out/ — "..%2f" survives URL parsing and
    // decodes to a real parent segment.
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const file = await readFile(target);
    const headers = {
      "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      "accept-ranges": "bytes",
    };
    const range = req.headers.range ? parseRange(req.headers.range, file.length) : null;
    if (range) {
      if (range.start >= file.length || range.start > range.end) {
        res.writeHead(416, { "content-range": `bytes */${file.length}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${range.start}-${range.end}/${file.length}`,
        "content-length": range.end - range.start + 1,
      });
      res.end(file.subarray(range.start, range.end + 1));
      return;
    }
    res.writeHead(200, headers);
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`serving out/ on http://localhost:${port}`);
});
