import type { MetadataRoute } from "next";

// force-static keeps the metadata route in the static export's page data.
export const dynamic = "force-static";

// A real /robots.txt instead of the 404 HTML page the static export serves
// today. One public page: everything is crawlable, there is nothing to
// disallow. No sitemap — a single URL has nothing for one to say.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
