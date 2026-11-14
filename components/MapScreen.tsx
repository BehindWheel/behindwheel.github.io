"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadCdnData, type CdnData } from "@/lib/cdn";
import {
  addStationaryMarkers,
  applyOverlays,
  BELARUS_BOUNDS,
  bindLayerPopups,
  bindMarkerPopups,
  createStationaryMarkers,
  LAYER_IDS,
  LIBERTY_STYLE,
  onStyleLoad,
  SATELLITE_STYLE,
  setLayerVisibility,
  setMarkersVisibility,
  type StationaryMarkerRegistry,
} from "@/lib/map-overlays";

type LayerToggles = {
  stationary: boolean;
  mediumSpeed: boolean;
  repairs: boolean;
};

const LAYER_TO_LAYERS: Record<keyof LayerToggles, string[]> = {
  stationary: [],
  mediumSpeed: [LAYER_IDS.mediumSpeed],
  repairs: [LAYER_IDS.repairsLines, LAYER_IDS.repairsPoints],
};

export default function MapScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef<CdnData | null>(null);
  const markersRef = useRef<StationaryMarkerRegistry | null>(null);
  const [toggles, setToggles] = useState<LayerToggles>({
    stationary: true,
    mediumSpeed: true,
    repairs: true,
  });
  const [satellite, setSatellite] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async (map: maplibregl.Map) => {
    try {
      const data = await loadCdnData();
      dataRef.current = data;
      if (!markersRef.current) {
        markersRef.current = createStationaryMarkers(data.stationary);
        addStationaryMarkers(map, markersRef.current);
        bindMarkerPopups(map, markersRef.current);
      }
      applyOverlays(map, data);
      bindLayerPopups(map, data);
      setGeneratedAt(data.generatedAt);
      setStatus("ready");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const map = new maplibregl.Map({
      container,
      style: LIBERTY_STYLE,
      bounds: BELARUS_BOUNDS,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "bottom-left");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "bottom-left",
    );

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
    };
  }, [loadData]);

  useEffect(() => {
    const map = mapRef.current;
    const registry = markersRef.current;
    if (!map) {
      return;
    }
    for (const key of ["stationary", "mediumSpeed", "repairs"] as const) {
      for (const layerId of LAYER_TO_LAYERS[key]) {
        setLayerVisibility(map, layerId, toggles[key]);
      }
    }
    setMarkersVisibility(registry?.markers ?? [], toggles.stationary);
  }, [toggles, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.setStyle(satellite ? SATELLITE_STYLE : LIBERTY_STYLE);
  }, [satellite]);

  const retry = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    setStatus("loading");
    void loadData(map);
  }, [loadData]);

  return (
    <div className="screen">
      <div ref={containerRef} className="map-container" />
      <div className="panel">
        <div className="panel-title">Grodno Roads</div>
        <label className="panel-row">
          <input
            type="checkbox"
            checked={toggles.stationary}
            onChange={(event) =>
              setToggles((prev) => ({ ...prev, stationary: event.target.checked }))
            }
          />
          Стационарные камеры
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
        </label>
        <label className="panel-row">
          <input
            type="checkbox"
            checked={satellite}
            onChange={(event) => setSatellite(event.target.checked)}
          />
          Спутник
        </label>
        <div className="panel-footer">
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
            <span>Данные от {generatedAt}</span>
          )}
        </div>
      </div>
    </div>
  );
}
