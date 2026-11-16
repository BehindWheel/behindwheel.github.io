// A minimal static server for the production export — the e2e tests point
// Playwright's webServer at it, so the suite exercises the same files GitHub
// Pages would ship. No dependencies: the export is a plain directory of
// files, the only care is content types and a "/" default.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
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

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (path === "" || path.endsWith("/")) {
      path += "index.html";
    }
    const file = await readFile(join(root, path));
    res.writeHead(200, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(port, () => {
  console.log(`serving out/ on http://localhost:${port}`);
});
