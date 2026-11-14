import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages hosts static files only: no server, no image optimizer.
  output: "export",
  images: { unoptimized: true },
  // GH Pages serves directory URLs (/about/ -> about/index.html), so every
  // route must end with a slash to resolve without server rewrites.
  trailingSlash: true,
};

export default nextConfig;
