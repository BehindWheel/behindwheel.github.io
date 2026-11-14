"use client";

import dynamic from "next/dynamic";

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

export default function Home() {
  return <MapScreen />;
}
