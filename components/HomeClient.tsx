"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { preconnect } from "react-dom";

// MapLibre touches window on import, so the map is client-only. The chunk
// placeholder stays blank on screen — a "Загрузка карты…" that vanishes in a
// beat reads as a hang, and the map renders its own tiles progressively right
// after — but keeps the announcement for screen readers: a bare empty div is
// silence, so the text sits in a status region, visually hidden.
const MapScreen = dynamic(() => import("@/components/MapScreen"), {
  ssr: false,
  loading: () => (
    <div className="screen-loading" role="status">
      <span className="sr-only">Загрузка карты…</span>
    </div>
  ),
});

export default function HomeClient() {
  // Resource hints through ReactDOM — the metadata API carries no preconnect
  // (the docs' resource-hints section). Both hosts are CORS-fetched (maplibre
  // tiles and glyphs, the CDN data), so the connection must be anonymous to
  // be reusable by fetch(). This component still SSRs as client code, so the
  // hints land in the first HTML; the calls dedupe, re-rendering is fine.
  preconnect("https://cdn-data.behindwheel.workers.dev", { crossOrigin: "anonymous" });
  preconnect("https://tiles.openfreemap.org", { crossOrigin: "anonymous" });

  // The offline shell (public/sw.js), production only — the dev server's
  // recompiles would fight a cache-first worker. Registration failures are
  // silently non-fatal: the site works like before without the worker.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return <MapScreen />;
}
