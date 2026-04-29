import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useGetLocations, getGetLocationsQueryKey, GetLocationsType } from "@workspace/api-client-react";
import { Loader2, Layers } from "lucide-react";
import DemographicsDrawer, { Demographics } from "../components/DemographicsDrawer";

type LayerType = "area" | "city" | "neighborhood" | "school" | null;

const LAYER_CONFIG = {
  area: { label: "Counties", color: "#3B82F6" },
  city: { label: "Cities", color: "#10B981" },
  neighborhood: { label: "Neighborhoods", color: "#F59E0B" },
  school: { label: "Schools", color: "#8B5CF6" },
};

const SRC = "bounds-src";
const FILL = "bounds-fill";
const LINE = "bounds-line";

type SelectedLocation = {
  name: string;
  locationId: string;
  demographics: Demographics;
};

// Flatten any depth of coordinate arrays to extract [lng, lat] pairs
function flatCoords(arr: unknown[]): number[][] {
  if (arr.length === 0) return [];
  if (typeof arr[0] === "number") return [arr as number[]];
  return (arr as unknown[][]).flatMap(flatCoords);
}

function getBbox(boundary: number[][][] | number[][][][]): maplibregl.LngLatBoundsLike {
  const coords = flatCoords(boundary as unknown[]);
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

export default function MapExplorer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 29.75, lng: -95.33 });
  const [activeLayer, setActiveLayer] = useState<LayerType>(null);
  const [mapReady, setMapReady] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  // Refs used inside stable event-handler closures
  const selectedRef = useRef<SelectedLocation | null>(null);
  const locationsRef = useRef<any[]>([]);

  // Step 1: init map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: [-95.33, 29.75],
        zoom: 10,
        antialias: true,
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      setInitError("WebGL is not available in this environment. Try opening the app in a full browser tab.");
      return;
    }

    instance.on("error", (e) => console.error("[Map error]", e.error?.message ?? e));

    instance.on("load", () => {
      instance.resize();
      setMapReady(true);
      setStyleReady(true);
    });

    instance.on("styledata", () => {
      if (instance.isStyleLoaded()) setStyleReady(true);
    });

    instance.on("moveend", () => {
      // Don't re-fetch while a boundary is selected — user may be panning/zooming
      if (selectedRef.current) return;
      const c = instance.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

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

  // Step 2: fetch boundary data
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

  // Step 3: draw boundary layers
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !styleReady) return;

    const removeLayers = () => {
      try {
        if (!m.isStyleLoaded()) return;
        if (m.getLayer(FILL)) m.removeLayer(FILL);
        if (m.getLayer(LINE)) m.removeLayer(LINE);
        if (m.getSource(SRC)) m.removeSource(SRC);
      } catch {
        // map already destroyed
      }
    };

    removeLayers();

    if (!activeLayer || !locationsData?.locations?.length) return;

    const { color } = LAYER_CONFIG[activeLayer];

    type LocMap = { boundary?: number[][][] | number[][][][]; geometryType?: string };

    const features: GeoJSON.Feature[] = locationsData.locations
      .filter((loc) => {
        const lm = loc.map as LocMap | undefined;
        return Array.isArray(lm?.boundary) && lm!.boundary!.length > 0;
      })
      .map((loc) => {
        const lm = loc.map as LocMap;
        return {
          type: "Feature" as const,
          geometry: {
            type: lm.geometryType ?? "Polygon",
            coordinates: lm.boundary!,
          } as GeoJSON.Geometry,
          properties: {
            name: loc.name,
            locationId: loc.locationId,
            // Embed demographics so onClick can read them without stale closure issues
            demographics: JSON.stringify((loc as any).demographics ?? {}),
          },
        };
      });

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
        paint: { "fill-color": color, "fill-opacity": 0 },
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
      console.warn("[Map] Failed to add layers:", e);
      return;
    }

    const onEnter = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      m.getCanvas().style.cursor = "pointer";
      const id = e.features[0].id;
      if (id !== undefined) m.setFeatureState({ source: SRC, id }, { hover: true });
    };

    const onLeave = (e: maplibregl.MapLayerMouseEvent) => {
      m.getCanvas().style.cursor = "";
      if (e.features?.length) {
        const id = e.features[0].id;
        if (id !== undefined) m.setFeatureState({ source: SRC, id }, { hover: false });
      }
    };

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties as {
        name: string;
        locationId: string;
        demographics: string;
      };
      setSelectedLocation({
        name: props.name,
        locationId: props.locationId,
        demographics: JSON.parse(props.demographics || "{}") as Demographics,
      });
    };

    m.on("mouseenter", FILL, onEnter);
    m.on("mouseleave", FILL, onLeave);
    m.on("click", FILL, onClick);

    return () => {
      m.off("mouseenter", FILL, onEnter);
      m.off("mouseleave", FILL, onLeave);
      m.off("click", FILL, onClick);
      removeLayers();
    };
  }, [locationsData, activeLayer, mapReady, styleReady]);

  // Keep refs in sync so stable closures (moveend) can read current values
  useEffect(() => { selectedRef.current = selectedLocation; }, [selectedLocation]);
  useEffect(() => { locationsRef.current = locationsData?.locations ?? []; }, [locationsData]);

  // Step 4: isolate selected boundary — filter + fill opacity + fit bounds
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady) return;
    try {
      if (!m.getLayer(FILL)) return;
      if (selectedLocation) {
        const f = ["==", ["get", "locationId"], selectedLocation.locationId] as maplibregl.FilterSpecification;
        m.setFilter(FILL, f);
        m.setFilter(LINE, f);
        m.setPaintProperty(FILL, "fill-opacity", 0.1);

        // Fit map to selected boundary (leave room for drawer on the right)
        const loc = locationsRef.current.find((l) => l.locationId === selectedLocation.locationId);
        if (loc?.map?.boundary) {
          const bbox = getBbox(loc.map.boundary);
          m.fitBounds(bbox, {
            padding: { top: 80, bottom: 80, left: 80, right: 420 },
            maxZoom: 14,
            duration: 600,
          });
        }
      } else {
        m.setFilter(FILL, null);
        m.setFilter(LINE, null);
        m.setPaintProperty(FILL, "fill-opacity", 0);
      }
    } catch {
      // layers not ready
    }
  }, [selectedLocation, styleReady, mapReady]);

  // Deselect when layer changes
  useEffect(() => {
    setSelectedLocation(null);
  }, [activeLayer]);

  // Popup CSS (just for popups we may add later — kept as baseline)
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .maplibregl-popup-content { background:#09090b !important; border:1px solid #27272a; border-radius:6px; padding:0; box-shadow:0 8px 24px rgb(0 0 0/.7); }
      .maplibregl-popup-tip { display:none; }
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

  const layerCfg = activeLayer ? LAYER_CONFIG[activeLayer] : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", background: "#09090b" }}>
      <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />

      {/* Controls */}
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-4 py-3 rounded-lg shadow-xl flex items-center gap-3">
          <div className="bg-zinc-800 p-1.5 rounded-md">
            <Layers className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Boundary Explorer</h1>
            <p className="text-xs text-zinc-500">
              {selectedLocation ? `Viewing: ${selectedLocation.name}` : "Select a layer below"}
            </p>
          </div>
        </div>

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

        {selectedLocation && (
          <button
            onClick={() => setSelectedLocation(null)}
            className="bg-zinc-950/90 backdrop-blur-md border border-zinc-700 px-3 py-2 rounded-lg text-xs text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-colors text-left"
          >
            ← Show all boundaries
          </button>
        )}
      </div>

      {/* Demographics drawer */}
      {layerCfg && (
        <DemographicsDrawer
          open={!!selectedLocation}
          name={selectedLocation?.name ?? ""}
          layerLabel={layerCfg.label}
          layerColor={layerCfg.color}
          demographics={selectedLocation?.demographics ?? {}}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  );
}
