"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AppBanner from "@/components/AppBanner";
import { dismissBanner, isBannerDismissed, subscribeBannerDismissal } from "@/lib/appBanner";
import DetailPanel, { type Detail } from "@/components/DetailPanel";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadCdnData, type CdnData } from "@/lib/cdn";
import { loadToggles, saveToggles } from "@/lib/layerToggles";
import { createMap, onStyleLoad } from "@/lib/map/createMap";
import { markerSearch, parseMarkerParam } from "@/lib/routing";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";
import {
  addMarkerGroups,
  bindMarkerSelections,
  createMarkerGroups,
  type MarkerGroups,
  type SelectionKind,
} from "@/lib/map/markers";
import { MarkerTiers, type LayerToggles } from "@/lib/map/marker-tiers";
import { applyOverlays, bindLayerSelection } from "@/lib/map/overlays";


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

// The CDN timestamp is ISO UTC; the user reads it as a local date.
function formatGeneratedAt(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

// The pipeline regenerates the data continuously; a timestamp older than a
// week means the feed has stalled — worth saying so on the map itself. Same
// horizon as the app banner's storage TTL, for the same ITP reasons.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export default function MapScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef<CdnData | null>(null);
  const markersRef = useRef<MarkerGroups | null>(null);
  // The marker tiers (dots → small → large signs) own the sign display from
  // here on, and the overlay lines follow the toggles through them — the
  // ref survives the toggles effect below.
  const tiersRef = useRef<MarkerTiers | null>(null);
  // The saved toggles win on boot — an explicit choice, like the theme.
  // This component is client-only (ssr: false), so localStorage is there.
  const [toggles, setToggles] = useState<LayerToggles>(() =>
    loadToggles(window.localStorage),
  );
  // The ref twin drives the MarkerTiers construction inside loadData,
  // whose identity must stay stable (the map effect tears down on change).
  const togglesRef = useRef(toggles);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  // The freshness face of the pill: the pipeline's timestamp read against a
  // week, computed when the data lands — not during render, where a clock
  // read breaks purity. An invalid timestamp compares NaN → false.
  const [stale, setStale] = useState(false);
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

  // The data promise comes from the caller: the map effect starts the fetch
  // on mount, racing the style/tile load instead of trailing it — awaiting
  // the map first would serialize the CDN round-trip behind it. retry()
  // builds a fresh promise the same way.
  const loadData = useCallback(
    async (map: maplibregl.Map, pending: Promise<CdnData>) => {
      try {
        const data = await pending;
        // Re-check after the fetch: the map can be unmounted while the CDN
        // round-trip is in flight (StrictMode double mount, fast navigation)
        // and adding markers to a dead map still attaches elements to the
        // live container — the double set of badges seen live.
        if (mapRef.current !== map) {
          return;
        }
        dataRef.current = data;
        setData(data);
        if (!markersRef.current) {
          markersRef.current = createMarkerGroups(data);
          addMarkerGroups(map, markersRef.current);
          bindMarkerSelections(markersRef.current, selectFeature);
          // The tier logic takes over sign visibility right away — its
          // constructor runs the first update for the current view.
          tiersRef.current = new MarkerTiers(map, markersRef.current, togglesRef.current);
        }
        applyOverlays(map, data);
        bindLayerSelection(map, selectFeature);
        setGeneratedAt(data.generatedAt);
        setStale(
          Date.now() - new Date(data.generatedAt).getTime() > STALE_AFTER_MS,
        );
        setStatus("ready");
        // A shared link's ?marker=<id> opens the panel once the data exists to
        // resolve it; an unresolvable id falls through to the not-found face.
        const id = parseMarkerParam(window.location.search);
        if (id) {
          setSelected({ kind: resolveKind(data, id) ?? "unknown", id });
          // The landing zoom may sit in the dot tier — fly into the sign tiers
          // so the linked marker itself is visible.
          tiersRef.current?.flyToSign(id);
        }
      } catch (error) {
        // Same guard as above: a fetch resolving against a dead map is
        // dropped, and so is its error — the retry button belongs to the
        // live screen only.
        if (mapRef.current !== map) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus("error");
      }
    },
    [selectFeature],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const map = createMap(container);
    mapRef.current = map;

    // The fetch starts on mount, in parallel with the style/tile load. The
    // pre-attached catch keeps an early rejection silent until loadData
    // observes it — a map that never fires "load" would otherwise leave the
    // rejection unobserved forever.
    const dataPromise = loadCdnData();
    dataPromise.catch(() => {});

    const load = () => void loadData(map, dataPromise);

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
      tiersRef.current?.remove();
      tiersRef.current = null;
      map.remove();
      mapRef.current = null;
      dataRef.current = null;
      markersRef.current = null;
      setData(null);
    };
  }, [loadData]);

  useEffect(() => {
    // The tier manager owns the sign display; the overlay lines follow the
    // toggles through it. The constructor already applies the current
    // toggles, so only a real toggle change needs a re-run here. The choice
    // also lands in localStorage, same as the theme and the banner.
    togglesRef.current = toggles;
    saveToggles(window.localStorage, toggles);
    tiersRef.current?.setToggles(toggles);
  }, [toggles]);

  // The filters popover closes on outside interaction and Escape (the popover
  // pattern); pointerdown so the map under it still gets the full click.
  useEffect(() => {
    if (!filtersOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      // Synthetic events dispatched on document have no element target —
      // nothing to check, nothing to close.
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".panel") || target.closest(".filter-button")) {
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
    void loadData(map, loadCdnData());
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
  // The dialog pattern silences the background — but only where the sheet
  // actually covers the map. From 768px the panel is a side sheet and most
  // of the map stays visible, so panning it with the panel open is
  // legitimate; the compact breakpoint matches the CSS (max-width: 767px).
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const onChange = () => setCompact(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const backgroundInert = panelOpen && compact;
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
        <div ref={containerRef} className="map-container" inert={backgroundInert ? true : undefined} />
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
          <div className="panel" id="layer-panel" inert={backgroundInert ? true : undefined}>
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
                {/* The live object count — the same number the map badges
                   break down by kind; hidden until the data lands. */}
                {data && <span className="panel-row-count">{data.stationary.length}</span>}
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
                {data && <span className="panel-row-count">{data.mediumSpeed.length}</span>}
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
                {data && <span className="panel-row-count">{data.repairs.length}</span>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="panel-row-icon" src="/icons/road-repairs-point.svg" alt="" />
              </label>
            </div>
          </div>
        )}
        {/* The data status rides the map itself: the filters panel is closed
           by default, so a status hidden inside it said nothing. The pill
           carries loading and freshness (announced politely); the error gets
           its own alert card with the retry — it must not be missable. */}
        {status === "error" ? (
          <div className="map-error" role="alert">
            <span>Не удалось загрузить данные: {errorMessage}</span>
            <button type="button" onClick={retry}>
              Повторить
            </button>
          </div>
        ) : (
          <p
            className={`data-pill${stale ? " data-pill-stale" : ""}`}
            role="status"
          >
            {status === "loading" && "Загрузка данных…"}
            {status === "ready" &&
              generatedAt &&
              (stale
                ? `Данные от ${formatGeneratedAt(generatedAt)} — устарели`
                : `Данные от ${formatGeneratedAt(generatedAt)}`)}
          </p>
        )}
      </div>
      {panelOpen && <DetailPanel detail={detail} onClose={closeDetail} />}
    </div>
  );
}
