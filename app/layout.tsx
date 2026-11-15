import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// metadataBase turns the relative og:image path into an absolute URL —
// without it a relative openGraph image is a build error, and scrapers
// (Telegram, Viber) only read absolute ones.
export const metadata: Metadata = {
  metadataBase: new URL("https://behindwheel.github.io"),
  // The one canonical URL: the site is the single page at "/" (the ?marker=
  // query is view state, not a separate address).
  alternates: {
    canonical: "/",
  },
  title: "Grodno Roads — камеры и ремонты дорог",
  description:
    "Публичная карта стационарных камер, участков средней скорости и ремонтов дорог Гродно и области.",
  // The SVG favicon comes from the app/icon.svg file convention; the PNG
  // sizes the SVG alone can't cover — iOS homescreen (apple-touch-icon)
  // ignores SVG and would otherwise pin a page screenshot.
  icons: {
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    siteName: "За рулем",
    title: "Grodno Roads — камеры и ремонты дорог",
    description:
      "Публичная карта стационарных камер, участков средней скорости и ремонтов дорог Гродно и области.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "За рулем — карта камер и ремонтов дорог Гродно и области",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Grodno Roads — камеры и ремонты дорог",
    description:
      "Публичная карта стационарных камер, участков средней скорости и ремонтов дорог Гродно и области.",
    images: ["/og.png"],
  },
};

// themeColor left the Metadata object for the Viewport export (deprecated
// there since v14). The colors match the pre-hydration body grounds in
// globals.css: the browser chrome paints the surface the page wakes into.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eee9e2" },
    { media: "(prefers-color-scheme: dark)", color: "#2a2d34" },
  ],
};

// The theme must resolve before the first paint: the stored choice or the
// device scheme gets stamped onto <html data-theme> here, and the token
// blocks in globals.css key off the attribute. Not a module — it has to run
// synchronously ahead of anything that paints.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the bootstrap script below stamps
    // data-theme onto <html> before hydration — by design, the theme must
    // resolve before the first paint — and the server-rendered tag can't
    // know it. The warning React otherwise logs every load is exactly the
    // attribute-only mismatch this escape hatch exists for.
    <html lang="ru" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
      </body>
    </html>
  );
}
