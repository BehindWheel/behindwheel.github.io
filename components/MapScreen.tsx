"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AppBanner from "@/components/AppBanner";
import { dismissBanner, isBannerDismissed, subscribeBannerDismissal } from "@/lib/appBanner";
import DetailPanel, { type Detail } from "@/components/DetailPanel";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadCdnData, type CdnData } from "@/lib/cdn";
import { createMap, onStyleLoad } from "@/lib/map/createMap";
import { markerSearch, parseMarkerParam } from "@/lib/routing";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";
import {
  addMarkerGroups,
  bindMarkerSelections,
  createMarkerGroups,
  setMarkersVisibility,
  type MarkerGroups,
  type SelectionKind,
} from "@/lib/map/markers";
import {
  applyOverlays,
  bindLayerSelection,
  LAYER_IDS,
  setLayerVisibility,
} from "@/lib/map/overlays";

type LayerToggles = {
  stationary: boolean;
  mediumSpeed: boolean;
  repairs: boolean;
};

export type SelectedFeature = {
  // "unknown" arrives from a ?marker= link whose kind doesn't parse —
  // findDetail misses on it and the panel shows its not-found face.
  kind: SelectionKind | "unknown";
  id: string;
};

function findDetail(data: CdnData, selected: SelectedFeature): Detail | null {
  switch (selected.kind) {
    case "stationary": {
      const camera = data.stationary.find((item) => item.id === selected.id);
      return camera ? { kind: "stationary", camera } : null;
    }
    case "mediumSpeed": {
      const camera = data.mediumSpeed.find((item) => item.id === selected.id);
      return camera ? { kind: "mediumSpeed", camera } : null;
    }
    case "repairs": {
      const repair = data.repairs.find((item) => item.id === selected.id);
      return repair ? { kind: "repairs", repair } : null;
    }
    default:
      return null;
  }
}

// Shared links carry no kind — ids are unique across the collections — so
// the kind comes from wherever the id actually lives. null: stale id, the
// panel shows its not-found face.
function resolveKind(data: CdnData, id: string): SelectionKind | null {
  if (data.stationary.some((item) => item.id === id)) {
    return "stationary";
  }
  if (data.mediumSpeed.some((item) => item.id === id)) {
    return "mediumSpeed";
  }
  if (data.repairs.some((item) => item.id === id)) {
    return "repairs";
  }
  return null;
}

const LAYER_TO_LAYERS: Record<keyof LayerToggles, string[]> = {
  stationary: [],
  mediumSpeed: [LAYER_IDS.mediumSpeed, LAYER_IDS.mediumSpeedHit],
  repairs: [LAYER_IDS.repairsLines, LAYER_IDS.repairsLinesHit],
};

// The CDN timestamp is ISO UTC; the user reads it as a local date.
function formatGeneratedAt(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

export default function MapScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef<CdnData | null>(null);
  const markersRef = useRef<MarkerGroups | null>(null);
  const [toggles, setToggles] = useState<LayerToggles>({
    stationary: true,
    mediumSpeed: true,
    repairs: true,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  // The data in state drives the detail panel; the ref twin drives the
  // style-swap replay, which runs outside render.
  const [data, setData] = useState<CdnData | null>(null);
  // The install banner: dismissed-ness lives in localStorage — external state
  // read through useSyncExternalStore. The server snapshot says dismissed, so
  // the prerendered HTML ships without the banner and it appears on hydration.
  const bannerDismissed = useSyncExternalStore(
    subscribeBannerDismissal,
    () => isBannerDismissed(window.localStorage),
    () => true,
  );

  const closeBanner = useCallback(() => {
    dismissBanner(window.localStorage);
  }, []);

  // replaceState, not pushState: the panel isn't a navigation step, so Back
  // keeps its plain meaning (leave the page) and the URL never stacks
  // marker entries.
  const updateUrl = useCallback((id: string | null) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${markerSearch(id)}`,
    );
  }, []);

  const selectFeature = useCallback(
    (kind: SelectionKind, id: string) => {
      setSelected({ kind, id });
      updateUrl(id);
    },
    [updateUrl],
  );

  const loadData = useCallback(async (map: maplibregl.Map) => {
    try {
      const data = await loadCdnData();
      dataRef.current = data;
      setData(data);
      if (!markersRef.current) {
        markersRef.current = createMarkerGroups(data);
        addMarkerGroups(map, markersRef.current);
        bindMarkerSelections(markersRef.current, selectFeature);
      }
      applyOverlays(map, data);
      bindLayerSelection(map, selectFeature);
      setGeneratedAt(data.generatedAt);
      setStatus("ready");
      // A shared link's ?marker=<id> opens the panel once the data exists to
      // resolve it; an unresolvable id falls through to the not-found face.
      const id = parseMarkerParam(window.location.search);
      if (id) {
        setSelected({ kind: resolveKind(data, id) ?? "unknown", id });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }, [selectFeature]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const map = createMap(container);
    mapRef.current = map;

    const load = () => void loadData(map);

    // setStyle() wipes sources/layers, so overlays are replayed on top of the
    // new basemap; data refetch is unnecessary — the DOM markers survive.
    onStyleLoad(map, () => {
      const data = dataRef.current;
      if (data) {
        applyOverlays(map, data);
      }
    });
    if (map.isStyleLoaded()) {
      load();
    } else {
      map.once("load", load);
    }
    return () => {
      map.remove();
      mapRef.current = null;
      dataRef.current = null;
      markersRef.current = null;
      setData(null);
    };
  }, [loadData]);

  useEffect(() => {
    const map = mapRef.current;
    const groups = markersRef.current;
    if (!map) {
      return;
    }
    for (const key of ["stationary", "mediumSpeed", "repairs"] as const) {
      for (const layerId of LAYER_TO_LAYERS[key]) {
        setLayerVisibility(map, layerId, toggles[key]);
      }
      setMarkersVisibility(groups?.[key].markers ?? [], toggles[key]);
    }
  }, [toggles, status]);

  // The filters popover closes on outside interaction and Escape (the popover
  // pattern); pointerdown so the map under it still gets the full click.
  useEffect(() => {
    if (!filtersOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".panel") || target?.closest(".filter-button")) {
        return;
      }
      setFiltersOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  const retry = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    setStatus("loading");
    void loadData(map);
  }, [loadData]);

  // The theme toggle: an explicit choice rides localStorage through
  // setTheme; with no choice the device scheme wins and this state follows
  // its flips via the store subscription.
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => onThemeChange(() => setThemeState(getTheme())), []);
  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const closeDetail = useCallback(() => {
    setSelected(null);
    updateUrl(null);
  }, [updateUrl]);
  // A selection with no matching detail is the ?marker= 404 — the panel is
  // still open, it just shows its not-found face.
  const panelOpen = selected !== null;
  const detail = useMemo(
    () => (data && selected ? findDetail(data, selected) : null),
    [data, selected],
  );

  return (
    <div className="screen">
      {/* The banner takes layout space above the map: nothing is covered, and
         MapLibre's default trackResize re-fits the canvas when it leaves. */}
      {!bannerDismissed && <AppBanner onClose={closeBanner} />}
      <div className="map-area">
        <div ref={containerRef} className="map-container" inert={panelOpen ? true : undefined} />
        <button
          type="button"
          className="filter-button"
          aria-expanded={filtersOpen}
          aria-controls="layer-panel"
          aria-label={filtersOpen ? "Скрыть фильтры" : "Показать фильтры"}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <span className="svg-icon icon-filter" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="filter-button theme-button"
          aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          onClick={toggleTheme}
        >
          <span
            className={`svg-icon ${theme === "dark" ? "icon-sun" : "icon-moon"}`}
            aria-hidden="true"
          />
        </button>
        {filtersOpen && (
          <div className="panel" id="layer-panel" inert={panelOpen ? true : undefined}>
            <div className="panel-title">Слои карты</div>
            <div className="panel-group" role="group" aria-label="Слои карты">
              <label className="panel-row">
                <input
                  type="checkbox"
                  checked={toggles.stationary}
                  onChange={(event) =>
                    setToggles((prev) => ({ ...prev, stationary: event.target.checked }))
                  }
                />
                Стационарные камеры
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="panel-row-icon" src="/icons/camera.svg" alt="" />
              </label>
              <label className="panel-row">
                <input
                  type="checkbox"
                  checked={toggles.mediumSpeed}
                  onChange={(event) =>
                    setToggles((prev) => ({ ...prev, mediumSpeed: event.target.checked }))
                  }
                />
                Средняя скорость
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="panel-row-icon" src="/icons/medium-speed.svg" alt="" />
              </label>
              <label className="panel-row">
                <input
                  type="checkbox"
                  checked={toggles.repairs}
                  onChange={(event) =>
                    setToggles((prev) => ({ ...prev, repairs: event.target.checked }))
                  }
                />
                Ремонты дорог
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="panel-row-icon" src="/icons/road-repairs-point.svg" alt="" />
              </label>
            </div>
            <div className="panel-footer" aria-live="polite">
              {status === "loading" && <span>Загрузка данных…</span>}
              {status === "error" && (
                <span className="panel-error">
                  Не удалось загрузить данные: {errorMessage}{" "}
                  <button type="button" onClick={retry}>
                    Повторить
                  </button>
                </span>
              )}
              {status === "ready" && generatedAt && (
                <span>Данные от {formatGeneratedAt(generatedAt)}</span>
              )}
            </div>
          </div>
        )}
      </div>
      {panelOpen && <DetailPanel detail={detail} onClose={closeDetail} />}
    </div>
  );
}
