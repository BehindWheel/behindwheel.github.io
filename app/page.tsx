"use client";

import dynamic from "next/dynamic";

// MapLibre touches window on import, so the map is client-only.
const MapScreen = dynamic(() => import("@/components/MapScreen"), {
  ssr: false,
  loading: () => <div className="screen-loading">Загрузка карты…</div>,
});

export default function Home() {
  return <MapScreen />;
}
