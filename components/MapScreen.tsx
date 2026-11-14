"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DetailPanel, { type Detail } from "@/components/DetailPanel";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadCdnData, type CdnData } from "@/lib/cdn";
import { createMap, onStyleLoad } from "@/lib/map/createMap";
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
import { LIBERTY_STYLE, SATELLITE_STYLE } from "@/lib/map/style";

type LayerToggles = {
  stationary: boolean;
  mediumSpeed: boolean;
  repairs: boolean;
};

export type SelectedFeature = {
  kind: SelectionKind;
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
  }
}

const LAYER_TO_LAYERS: Record<keyof LayerToggles, string[]> = {
  stationary: [],
  mediumSpeed: [LAYER_IDS.mediumSpeed],
  repairs: [LAYER_IDS.repairsLines],
};

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
  const [satellite, setSatellite] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  // The data in state drives the detail panel; the ref twin drives the
  // style-swap replay, which runs outside render.
  const [data, setData] = useState<CdnData | null>(null);

  const selectFeature = useCallback((kind: SelectionKind, id: string) => {
    setSelected({ kind, id });
  }, []);

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

  const closeDetail = useCallback(() => setSelected(null), []);
  const detail = useMemo(
    () => (data && selected ? findDetail(data, selected) : null),
    [data, selected],
  );

  return (
    <div className="screen">
      <div ref={containerRef} className="map-container" inert={detail ? true : undefined} />
      <div className="panel" inert={detail ? true : undefined}>
        <div className="panel-title">Grodno Roads</div>
        <div role="group" aria-label="Слои карты">
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
            <span>Данные от {generatedAt}</span>
          )}
        </div>
      </div>
      {detail && <DetailPanel detail={detail} onClose={closeDetail} />}
    </div>
  );
}
