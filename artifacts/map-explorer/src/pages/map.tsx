import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
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
  const map = useRef<mapboxgl.Map | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 29.75, lng: -95.33 });
  const [activeLayer, setActiveLayer] = useState<LayerType>(null);
  const [hoveredLocationId, setHoveredLocationId] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Fetch boundaries
  const { data: locationsData, isFetching } = useGetLocations(
    { lat: center.lat, long: center.lng, type: activeLayer as GetLocationsType },
    {
      query: {
        enabled: !!activeLayer && mapReady,
        queryKey: getGetLocationsQueryKey({ lat: center.lat, long: center.lng, type: activeLayer as GetLocationsType }),
      }
    }
  );

  // Fetch token from API then initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    if (!mapboxgl.supported()) {
      setWebglError(true);
      return;
    }

    fetch("/api/config")
      .then((r) => r.json())
      .then(({ mapboxToken }: { mapboxToken: string }) => {
        if (!mapboxToken) {
          setWebglError(true);
          return;
        }

        mapboxgl.accessToken = mapboxToken;

        try {
          const instance = new mapboxgl.Map({
            container: mapContainer.current!,
            style: "mapbox://styles/mapbox/dark-v11",
            center: [center.lng, center.lat],
            zoom: 10,
            antialias: true,
          });

          instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

          instance.on("moveend", () => {
            const c = instance.getCenter();
            setCenter({ lat: c.lat, lng: c.lng });
          });

          instance.on("load", () => {
            setMapReady(true);
          });

          map.current = instance;
        } catch {
          setWebglError(true);
        }
      })
      .catch(() => setWebglError(true));

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update map layers when data changes
  useEffect(() => {
    if (!map.current || !mapReady) return;

    const sourceId = "locations-source";
    const fillLayerId = "locations-fill";
    const lineLayerId = "locations-line";

    // Remove previously added layers/source (no handlers to remove yet)
    const removeLayers = () => {
      if (!map.current) return;
      if (map.current.getLayer(fillLayerId)) map.current.removeLayer(fillLayerId);
      if (map.current.getLayer(lineLayerId)) map.current.removeLayer(lineLayerId);
      if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
    };

    removeLayers();

    if (!activeLayer || !locationsData?.locations?.length) return;

    const layerConfig = LAYER_CONFIG[activeLayer];

    const features: GeoJSON.Feature[] = locationsData.locations
      .filter((loc) => loc.map?.polygon)
      .map((loc) => ({
        type: "Feature" as const,
        geometry: loc.map!.polygon as GeoJSON.Geometry,
        properties: {
          name: loc.name,
          locationId: loc.locationId,
          type: loc.type,
        },
      }));

    if (features.length === 0) return;

    map.current.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features },
      generateId: true,
    });

    map.current.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": layerConfig.color,
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.45, 0.2],
      },
    });

    map.current.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": layerConfig.color,
        "line-width": 1.5,
      },
    });

    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false });

    const onMouseEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!map.current || !e.features?.length) return;
      map.current.getCanvas().style.cursor = "pointer";
      const id = e.features[0].id;
      setHoveredLocationId((prev) => {
        if (prev !== null) map.current?.setFeatureState({ source: sourceId, id: prev }, { hover: false });
        if (id !== undefined) map.current?.setFeatureState({ source: sourceId, id }, { hover: true });
        return id !== undefined ? String(id) : null;
      });
    };

    const onMouseLeave = () => {
      if (!map.current) return;
      map.current.getCanvas().style.cursor = "";
      setHoveredLocationId((prev) => {
        if (prev !== null) map.current?.setFeatureState({ source: sourceId, id: prev }, { hover: false });
        return null;
      });
    };

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features?.length || !map.current) return;
      const name = e.features[0].properties?.name ?? "";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="padding:10px;min-width:140px;color:#fff;background:#09090b;border-radius:6px;">` +
          `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a1a1aa;margin-bottom:4px;">${layerConfig.label}</div>` +
          `<div style="font-size:15px;font-weight:700;">${name}</div>` +
          `</div>`
        )
        .addTo(map.current);
    };

    map.current.on("mouseenter", fillLayerId, onMouseEnter);
    map.current.on("mouseleave", fillLayerId, onMouseLeave);
    map.current.on("click", fillLayerId, onClick);

    return () => {
      popup.remove();
      if (map.current) {
        map.current.off("mouseenter", fillLayerId, onMouseEnter);
        map.current.off("mouseleave", fillLayerId, onMouseLeave);
        map.current.off("click", fillLayerId, onClick);
      }
      removeLayers();
    };
  }, [locationsData, activeLayer, mapReady]);

  // Popup dark styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .mapboxgl-popup-content { background:#09090b !important; border:1px solid #27272a; border-radius:6px; padding:0; box-shadow:0 4px 16px rgb(0 0 0 / .6); }
      .mapboxgl-popup-tip { display:none; }
      .mapboxgl-popup-close-button { color:#71717a; font-size:18px; padding:4px 8px; line-height:1; }
      .mapboxgl-popup-close-button:hover { color:#fff; background:transparent; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  if (webglError) {
    return (
      <div className="w-full h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <Layers className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-zinc-200 mb-2">Map unavailable</h1>
          <p className="text-sm text-zinc-400">
            WebGL is required to render the map. Try opening this app in a standalone browser tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-zinc-950 overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Floating UI */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
        {/* Title */}
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-4 py-3 rounded-lg shadow-xl flex items-center gap-3">
          <div className="bg-zinc-800 p-1.5 rounded-md text-zinc-300">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Boundary Explorer</h1>
            <p className="text-xs text-zinc-500">Select a layer to display boundaries</p>
          </div>
        </div>

        {/* Layer buttons */}
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 p-2 rounded-lg shadow-xl flex flex-col gap-1 w-52">
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Layer</span>
            {isFetching && <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />}
          </div>

          {(Object.entries(LAYER_CONFIG) as [NonNullable<LayerType>, typeof LAYER_CONFIG.area][]).map(([key, config]) => {
            const isActive = activeLayer === key;
            return (
              <button
                key={key}
                onClick={() => setActiveLayer(isActive ? null : key)}
                className={
                  "flex items-center gap-2.5 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors " +
                  (isActive
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200")
                }
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: isActive ? config.color : "transparent", border: "1.5px solid " + config.color }}
                />
                {config.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
