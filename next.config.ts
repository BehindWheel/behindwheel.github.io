import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages hosts static files only: no server, no image optimizer.
  output: "export",
  images: { unoptimized: true },
  // GH Pages serves directory URLs (/about/ -> about/index.html), so every
  // route must end with a slash to resolve without server rewrites.
  trailingSlash: true,
  // The dev-only "N" badge sits bottom-left over the drive button and the
  // data pill, and every other corner is taken by the map's own controls.
  // Compile and runtime errors still show in the error overlay.
  devIndicators: false,
};

export default nextConfig;
