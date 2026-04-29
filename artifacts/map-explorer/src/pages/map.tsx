import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useGetLocations, getGetLocationsQueryKey, GetLocationsType } from "@workspace/api-client-react";
import { Loader2, Layers } from "lucide-react";

type LayerType = "area" | "city" | "neighborhood" | "school" | null;

const LAYER_CONFIG = {
  area: { label: "Counties", color: "#3B82F6" },
  city: { label: "Cities", color: "#10B981" },
  neighborhood: { label: "Neighborhoods", color: "#F59E0B" },
  school: { label: "Schools", color: "#8B5CF6" },
};

export default function MapExplorer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 29.75, lng: -95.33 });
  const [activeLayer, setActiveLayer] = useState<LayerType>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Init map on mount — uses CARTO's free dark style, no token needed
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: mapContainer.current,
        // CARTO dark style — free, no token required, no domain restrictions
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: [-95.33, 29.75],
        zoom: 10,
        antialias: true,
        failIfMajorPerformanceCaveat: false,
      });
    } catch (e) {
      setInitError("WebGL is not available in this environment. Try opening the app in a full browser tab.");
      return;
    }

    instance.on("error", (e) => {
      console.error("[Map error]", e.error?.message ?? e);
    });

    instance.on("load", () => {
      console.log("[Map] loaded");
      instance.resize();
      setMapReady(true);
      setStyleReady(true);
    });

    instance.on("styledata", () => {
      if (instance.isStyleLoaded()) setStyleReady(true);
    });

    instance.on("moveend", () => {
      const c = instance.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Resize after a small delay in case the container wasn't fully laid out
    const t = setTimeout(() => instance.resize(), 500);
    map.current = instance;

    return () => {
      clearTimeout(t);
      instance.remove();
      map.current = null;
      setMapReady(false);
      setStyleReady(false);
    };
  }, []);

  // Step 2: data
  const { data: locationsData, isFetching } = useGetLocations(
    { lat: center.lat, long: center.lng, type: activeLayer as GetLocationsType },
    {
      query: {
        enabled: !!activeLayer && mapReady,
        queryKey: getGetLocationsQueryKey({
          lat: center.lat,
          long: center.lng,
          type: activeLayer as GetLocationsType,
        }),
      },
    }
  );

  // Step 3: draw layers
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !styleReady) return;

    const SRC = "bounds-src";
    const FILL = "bounds-fill";
    const LINE = "bounds-line";

    const removeLayers = () => {
      // Guard: map may have been removed (e.g. during HMR)
      try {
        if (!m.isStyleLoaded()) return;
        if (m.getLayer(FILL)) m.removeLayer(FILL);
        if (m.getLayer(LINE)) m.removeLayer(LINE);
        if (m.getSource(SRC)) m.removeSource(SRC);
      } catch {
        // Map was already destroyed — nothing to clean up
      }
    };

    removeLayers();

    if (!activeLayer || !locationsData?.locations?.length) return;

    const { color, label } = LAYER_CONFIG[activeLayer];

    type LocMap = {
      boundary?: number[][][] | number[][][][];
      geometryType?: string;
    };
    const features: GeoJSON.Feature[] = locationsData.locations
      .filter((loc) => {
        const m = loc.map as LocMap | undefined;
        return Array.isArray(m?.boundary) && m!.boundary!.length > 0;
      })
      .map((loc) => {
        const m = loc.map as LocMap;
        const geomType = m.geometryType ?? "Polygon";
        return {
          type: "Feature" as const,
          geometry: {
            type: geomType,
            // boundary already matches GeoJSON coordinate nesting for both
            // Polygon (number[][][]) and MultiPolygon (number[][][][])
            coordinates: m.boundary!,
          } as GeoJSON.Geometry,
          properties: { name: loc.name, locationId: loc.locationId },
        };
      });

    console.log(`[Map] ${activeLayer}: ${features.length} features loaded`);
    if (!features.length) return;

    try {
      m.addSource(SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
        generateId: true,
      });

      m.addLayer({
        id: FILL,
        type: "fill",
        source: SRC,
        paint: {
          "fill-color": color,
          "fill-opacity": 0,
        },
      });

      m.addLayer({
        id: LINE,
        type: "line",
        source: SRC,
        paint: {
          "line-color": color,
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 1.5],
          "line-opacity": 0.9,
        },
      });
    } catch (e) {
      console.warn("[Map] Failed to add layers (style not ready):", e);
      return;
    }

    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false });

    const onEnter = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      m.getCanvas().style.cursor = "pointer";
      const id = e.features[0].id;
      setHoveredId((prev) => {
        if (prev !== null) m.setFeatureState({ source: SRC, id: prev }, { hover: false });
        if (id !== undefined) m.setFeatureState({ source: SRC, id }, { hover: true });
        return id !== undefined ? String(id) : null;
      });
    };

    const onLeave = () => {
      m.getCanvas().style.cursor = "";
      setHoveredId((prev) => {
        if (prev !== null) m.setFeatureState({ source: SRC, id: prev }, { hover: false });
        return null;
      });
    };

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const name = e.features[0].properties?.name ?? "";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="padding:10px;min-width:150px;color:#f4f4f5;background:#09090b;border-radius:6px;">` +
            `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#71717a;margin-bottom:4px;">${label}</div>` +
            `<div style="font-size:14px;font-weight:700;">${name}</div>` +
          `</div>`
        )
        .addTo(m);
    };

    m.on("mouseenter", FILL, onEnter);
    m.on("mouseleave", FILL, onLeave);
    m.on("click", FILL, onClick);

    return () => {
      popup.remove();
      m.off("mouseenter", FILL, onEnter);
      m.off("mouseleave", FILL, onLeave);
      m.off("click", FILL, onClick);
      removeLayers();
    };
  }, [locationsData, activeLayer, mapReady, styleReady]);

  // Popup styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .maplibregl-popup-content { background:#09090b !important; border:1px solid #27272a; border-radius:6px; padding:0; box-shadow:0 8px 24px rgb(0 0 0/.7); }
      .maplibregl-popup-tip { display:none; }
      .maplibregl-popup-close-button { color:#71717a; font-size:18px; padding:2px 8px; line-height:1; }
      .maplibregl-popup-close-button:hover { color:#fff; background:transparent; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  if (initError) {
    return (
      <div className="w-full h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <Layers className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
          <h1 className="text-base font-semibold text-zinc-200 mb-2">Map could not load</h1>
          <p className="text-sm text-zinc-500">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", background: "#09090b" }}>
      <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />

      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header */}
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-4 py-3 rounded-lg shadow-xl flex items-center gap-3">
          <div className="bg-zinc-800 p-1.5 rounded-md">
            <Layers className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Boundary Explorer</h1>
            <p className="text-xs text-zinc-500">Select a layer below</p>
          </div>
        </div>

        {/* Layer buttons */}
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 p-2 rounded-lg shadow-xl w-52">
          <div className="px-2 py-1 flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Layer</span>
            {isFetching && <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />}
          </div>

          {(Object.entries(LAYER_CONFIG) as [NonNullable<LayerType>, typeof LAYER_CONFIG.area][]).map(([key, { label, color }]) => {
            const isActive = activeLayer === key;
            return (
              <button
                key={key}
                onClick={() => setActiveLayer(isActive ? null : key)}
                className={
                  "flex items-center gap-2.5 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors " +
                  (isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200")
                }
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: isActive ? color : "transparent", border: "1.5px solid " + color }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {!mapReady && !initError && (
          <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-3 py-2 rounded-lg flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
            <span className="text-xs text-zinc-500">Loading map…</span>
          </div>
        )}
      </div>
    </div>
  );
}
