import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useGetLocations, getGetLocationsQueryKey, GetLocationsType } from "@workspace/api-client-react";
import { Loader2, Layers } from "lucide-react";

// Mapbox Token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

type LayerType = "area" | "city" | "neighborhood" | "school" | null;

const LAYER_CONFIG = {
  area: { label: "Counties", color: "#3B82F6", id: "area" },
  city: { label: "Cities", color: "#10B981", id: "city" },
  neighborhood: { label: "Neighborhoods", color: "#F59E0B", id: "neighborhood" },
  school: { label: "Schools", color: "#8B5CF6", id: "school" },
};

export default function MapExplorer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 29.75, lng: -95.33 });
  const [activeLayer, setActiveLayer] = useState<LayerType>(null);
  const [hoveredLocationId, setHoveredLocationId] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);

  // Fetch boundaries
  const { data: locationsData, isFetching } = useGetLocations(
    { lat: center.lat, long: center.lng, type: activeLayer as GetLocationsType },
    {
      query: {
        enabled: !!activeLayer,
        queryKey: getGetLocationsQueryKey({ lat: center.lat, long: center.lng, type: activeLayer as GetLocationsType }),
      }
    }
  );

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    if (!mapboxgl.supported()) {
      setWebglError(true);
      return;
    }

    try {
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [center.lng, center.lat],
      zoom: 10,
      pitch: 0,
      bearing: 0,
      antialias: true,
    });
    } catch (e) {
      setWebglError(true);
      return;
    }

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.current.on("moveend", () => {
      const c = map.current?.getCenter();
      if (c) {
        setCenter({ lat: c.lat, lng: c.lng });
      }
    });

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update map layers when data changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const sourceId = "locations-source";
    const fillLayerId = "locations-fill";
    const lineLayerId = "locations-line";

    // Remove existing layers and source
    if (map.current.getLayer(fillLayerId)) map.current.removeLayer(fillLayerId);
    if (map.current.getLayer(lineLayerId)) map.current.removeLayer(lineLayerId);
    if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);

    if (!activeLayer || !locationsData?.locations?.length) return;

    const layerConfig = LAYER_CONFIG[activeLayer];

    const features: any[] = locationsData.locations
      .filter((loc) => loc.map?.polygon)
      .map((loc) => ({
        type: "Feature",
        geometry: loc.map?.polygon,
        properties: {
          name: loc.name,
          locationId: loc.locationId,
          type: loc.type,
        },
      }));

    if (features.length === 0) return;

    const geojson: any = {
      type: "FeatureCollection",
      features,
    };

    map.current.addSource(sourceId, {
      type: "geojson",
      data: geojson,
      generateId: true, // Needed for hover states
    });

    map.current.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": layerConfig.color,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.45,
          0.25,
        ],
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

    let popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      className: "dark-theme-popup"
    });

    const onMouseEnter = (e: any) => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "pointer";
        if (e.features.length > 0) {
          if (hoveredLocationId) {
            map.current.setFeatureState({ source: sourceId, id: hoveredLocationId }, { hover: false });
          }
          const id = e.features[0].id;
          setHoveredLocationId(id);
          map.current.setFeatureState({ source: sourceId, id: id }, { hover: true });
        }
      }
    };

    const onMouseLeave = () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "";
        if (hoveredLocationId) {
          map.current.setFeatureState({ source: sourceId, id: hoveredLocationId }, { hover: false });
          setHoveredLocationId(null);
        }
      }
    };

    const onClick = (e: any) => {
      if (e.features.length > 0 && map.current) {
        const feature = e.features[0];
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="p-2 min-w-40 text-white bg-zinc-950 rounded-md border border-zinc-800">
              <div class="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-1">${layerConfig.label}</div>
              <div class="text-base font-bold">${feature.properties.name}</div>
            </div>`
          )
          .addTo(map.current);
      }
    };

    map.current.on("mouseenter", fillLayerId, onMouseEnter);
    map.current.on("mouseleave", fillLayerId, onMouseLeave);
    map.current.on("click", fillLayerId, onClick);

    return () => {
      if (map.current) {
        map.current.off("mouseenter", fillLayerId, onMouseEnter);
        map.current.off("mouseleave", fillLayerId, onMouseLeave);
        map.current.off("click", fillLayerId, onClick);
      }
      popup.remove();
    };
  }, [locationsData, activeLayer]);

  // Global styles for Mapbox popup since it's injected outside React root
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      .mapboxgl-popup-content {
        background: #09090b !important;
        border: 1px solid #27272a;
        border-radius: 6px;
        padding: 0;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.5);
      }
      .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip {
        border-top-color: #27272a !important;
      }
      .mapboxgl-popup-anchor-top .mapboxgl-popup-tip {
        border-bottom-color: #27272a !important;
      }
      .mapboxgl-popup-anchor-left .mapboxgl-popup-tip {
        border-right-color: #27272a !important;
      }
      .mapboxgl-popup-anchor-right .mapboxgl-popup-tip {
        border-left-color: #27272a !important;
      }
      .mapboxgl-popup-close-button {
        color: #a1a1aa;
        font-size: 16px;
        padding: 4px 8px;
        right: 0;
        top: 0;
      }
      .mapboxgl-popup-close-button:hover {
        background-color: transparent;
        color: #fff;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  if (webglError) {
    return (
      <div className="relative w-full h-[100dvh] bg-zinc-950 flex items-center justify-center dark">
        <div className="text-center max-w-sm px-6">
          <Layers className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-zinc-200 mb-2">WebGL not available</h1>
          <p className="text-sm text-zinc-400">
            Your browser or environment does not support WebGL, which is required to render the map.
            Try opening this app in a full browser window.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-zinc-950 overflow-hidden dark">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0 z-0" />

      {/* Floating Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-4">
        {/* Title Badge */}
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <div className="bg-zinc-800 p-1.5 rounded-md text-zinc-200">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Boundary Explorer</h1>
            <p className="text-xs text-zinc-400">Precision Location Analysis</p>
          </div>
        </div>

        {/* Layer Toggles */}
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 p-2 rounded-lg shadow-lg flex flex-col gap-1.5 w-52">
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Active Layer</span>
            {isFetching && <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />}
          </div>
          
          {(Object.entries(LAYER_CONFIG) as [LayerType, typeof LAYER_CONFIG.area][]).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setActiveLayer(activeLayer === key ? null : key)}
              className={
                "flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 border border-transparent " +
                (activeLayer === key
                  ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200")
              }
              data-testid={"layer-toggle-" + key}
            >
              <span>{config.label}</span>
              <div
                className="w-3 h-3 rounded-sm opacity-80"
                style={{ backgroundColor: activeLayer === key ? config.color : "transparent", border: "1px solid " + config.color }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}