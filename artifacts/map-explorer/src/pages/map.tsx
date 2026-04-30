import React, { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useGetLocations, getGetLocationsQueryKey, GetLocationsType } from "@workspace/api-client-react";
import { Loader2, Layers, Home } from "lucide-react";
import LocationDrawer from "../components/LocationDrawer";
import ListingDrawer from "../components/ListingDrawer";
import { type Demographics } from "../components/DemographicsDrawer";
import { type SchoolData } from "../components/SchoolDrawer";

type RawListing = {
  map: { latitude: number; longitude: number };
  mlsNumber: string;
  boardId?: string;
};

const LISTINGS_SRC = "listings-src";
const LISTINGS_DOT = "listings-dot";
const LISTINGS_BLOOM = "listings-bloom";
const LISTINGS_CONCURRENCY = 4;
const MAX_MAP_POINTS = 300;
const RESULTS_PER_PAGE = 100;

const PRICE_RANGES = [
  { key: "lt500k",   label: "<500K",   min: null,    max: 500000  },
  { key: "500k1m",   label: "500K-1M", min: 500000,  max: 1000000 },
  { key: "1m1.5m",   label: "1M-1.5M", min: 1000000, max: 1500000 },
  { key: "gt1.5m",   label: "1.5M+",   min: 1500000, max: null    },
] as const;

type PriceKey = typeof PRICE_RANGES[number]["key"];

type ListingFilters = {
  listingType: "Sale" | "Lease" | null;
  minBeds: number | null;
  minBaths: number | null;
  priceKey: PriceKey | null;
};

const DEFAULT_FILTERS: ListingFilters = {
  listingType: null,
  minBeds: null,
  minBaths: null,
  priceKey: null,
};

type LayerType = "area" | "city" | "neighborhood" | "school" | "postalCode" | "schoolDistrict" | null;

const LAYER_CONFIG = {
  area:           { label: "Counties",         color: "#3B82F6" },
  city:           { label: "Cities",           color: "#10B981" },
  neighborhood:   { label: "Neighborhoods",    color: "#F59E0B" },
  postalCode:     { label: "Postal Codes",     color: "#60A5FA" },
  schoolDistrict: { label: "School Districts", color: "#FBBF24" },
  school:         { label: "Schools",          color: "#8B5CF6" },
};

// Maps a Repliers location type string → our active layer key (null = no layer)
const LOCATION_TYPE_TO_LAYER: Record<string, LayerType> = {
  area:           "area",
  city:           "city",
  "city-alternate": "city",
  neighborhood:   "neighborhood",
  school:         "school",
  postalCode:     "postalCode",
  schoolDistrict: "schoolDistrict",
};

const SRC = "bounds-src";
const FILL = "bounds-fill";
const LINE = "bounds-line";

type SelectedLocation = {
  name: string;
  locationId: string;
  demographics: Demographics;
  school: SchoolData | null;
  boundary?: number[][][][] | number[][][];
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
  const [selectedListing, setSelectedListing] = useState<{ mlsNumber: string; boardId: string } | null>(null);
  const [listingCount, setListingCount] = useState<{ loaded: number; total: number } | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingFilters, setListingFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  const [listingStyleRetry, setListingStyleRetry] = useState(0);
  const [listingBoundsKey, setListingBoundsKey] = useState(0);
  // Pending location to select after an activeLayer change (avoids the deselect effect clobbering it)
  const pendingLocationRef = useRef<SelectedLocation | null>(null);
  // Refs used inside stable event-handler closures
  const selectedRef = useRef<SelectedLocation | null>(null);
  const locationsRef = useRef<any[]>([]);
  const listingsSessionRef = useRef(0);
  const listingsBatchRef = useRef(0);
  const layerJustChangedRef = useRef(false);
  // Delta-update tracking: coordinate-keyed feature map persists across bounds-only reloads
  const listingFeaturesRef = useRef<Map<string, GeoJSON.Feature>>(new Map());
  // Stable "identity" of everything except viewport bounds — changes trigger a full reset
  const listingsResetKeyRef = useRef("");

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
        failIfMajorPerformanceCaveat: false,
      } as maplibregl.MapOptions);
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
      if (selectedRef.current) {
        // Re-fetch listings with new viewport bounds
        setListingBoundsKey((n) => n + 1);
        return;
      }
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
        // Don't treat data as stale for 30s so pan/zoom doesn't re-fetch unnecessarily
        staleTime: 30_000,
      },
    }
  );

  // Step 3a: set up layer structure (only when layer type changes — avoids teardown flicker)
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !styleReady) return;

    const removeLayers = () => {
      try {
        if (!m.isStyleLoaded()) return;
        if (m.getLayer(FILL)) m.removeLayer(FILL);
        if (m.getLayer(LINE)) m.removeLayer(LINE);
        if (m.getSource(SRC)) m.removeSource(SRC);
      } catch { /* map already destroyed */ }
    };

    removeLayers();
    if (!activeLayer) return;

    // Signal Step 3b to fit bounds on the first data load for this layer
    layerJustChangedRef.current = true;

    const { color } = LAYER_CONFIG[activeLayer];

    try {
      // Start with empty data — Step 3b will fill it in
      m.addSource(SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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

    const tooltip = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: [0, -4],
      className: "boundary-tooltip",
      maxWidth: "240px",
    });

    let hoveredId: string | number | undefined;

    const clearHover = () => {
      if (hoveredId !== undefined) {
        m.setFeatureState({ source: SRC, id: hoveredId }, { hover: false });
        hoveredId = undefined;
      }
    };

    const onEnter = (e: maplibregl.MapLayerMouseEvent) => {
      m.getCanvas().style.cursor = "pointer";
      if (!e.features?.length) return;
      clearHover();
      hoveredId = e.features[0].id;
      if (hoveredId !== undefined) m.setFeatureState({ source: SRC, id: hoveredId }, { hover: true });
      if (selectedRef.current) return;
      const name = (e.features[0].properties as { name: string }).name;
      tooltip.setLngLat(e.lngLat).setHTML(`<span>${name}</span>`).addTo(m);
    };

    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const newId = e.features[0].id;
      if (newId !== hoveredId) {
        clearHover();
        hoveredId = newId;
        if (hoveredId !== undefined) m.setFeatureState({ source: SRC, id: hoveredId }, { hover: true });
        if (!selectedRef.current) {
          const name = (e.features[0].properties as { name: string }).name;
          tooltip.setHTML(`<span>${name}</span>`);
        }
      }
      if (selectedRef.current) {
        tooltip.remove();
        return;
      }
      tooltip.setLngLat(e.lngLat);
    };

    const onLeave = () => {
      m.getCanvas().style.cursor = "";
      clearHover();
      tooltip.remove();
    };

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      // Don't respond to boundary clicks when a listing dot is at this point
      if (m.getLayer(LISTINGS_DOT) && m.queryRenderedFeatures(e.point, { layers: [LISTINGS_DOT] }).length) return;
      tooltip.remove();
      const props = e.features[0].properties as {
        name: string;
        locationId: string;
        demographics: string;
        school: string;
      };
      // Capture boundary now while locationsRef is guaranteed to have it (the feature was just clicked)
      const locEntry = locationsRef.current.find((l) => l.locationId === props.locationId);
      setSelectedLocation({
        name: props.name,
        locationId: props.locationId,
        demographics: JSON.parse(props.demographics || "{}") as Demographics,
        school: JSON.parse(props.school || "null") as SchoolData | null,
        boundary: locEntry?.map?.boundary,
      });
    };

    m.on("mouseenter", FILL, onEnter);
    m.on("mousemove", FILL, onMove);
    m.on("mouseleave", FILL, onLeave);
    m.on("click", FILL, onClick);

    return () => {
      tooltip.remove();
      // map.current is set to null by the Step 1 cleanup on component unmount.
      // If it's null here, the map has already been destroyed — skip all map calls.
      if (!map.current) return;
      m.off("mouseenter", FILL, onEnter);
      m.off("mousemove", FILL, onMove);
      m.off("mouseleave", FILL, onLeave);
      m.off("click", FILL, onClick);
      clearHover();
      removeLayers();
    };
  }, [activeLayer, mapReady, styleReady]);

  // Step 2b: listing dot interactions (hover cursor + click-to-detail)
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !styleReady) return;

    const onDotEnter = () => { m.getCanvas().style.cursor = "pointer"; };
    const onDotLeave = () => { m.getCanvas().style.cursor = ""; };
    const onDotClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties as { mlsNumber: string; boardId: string };
      setSelectedListing({ mlsNumber: props.mlsNumber, boardId: props.boardId });
    };

    m.on("mouseenter", LISTINGS_DOT, onDotEnter);
    m.on("mouseleave", LISTINGS_DOT, onDotLeave);
    m.on("click", LISTINGS_DOT, onDotClick);

    return () => {
      if (!map.current) return;
      m.off("mouseenter", LISTINGS_DOT, onDotEnter);
      m.off("mouseleave", LISTINGS_DOT, onDotLeave);
      m.off("click", LISTINGS_DOT, onDotClick);
    };
  }, [mapReady, styleReady]);

  // Step 3b: push new data into the existing source (no layer teardown → no flicker)
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady) return;

    const src = m.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    // While a refetch is in flight locationsData is undefined; skipping here keeps the
    // source showing its last painted features so boundaries never flash-disappear.
    if (!locationsData) return;

    type LocMap = { boundary?: number[][][] | number[][][][]; geometryType?: string };

    const features: GeoJSON.Feature[] = (locationsData?.locations ?? [])
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
            demographics: JSON.stringify((loc as any).demographics ?? {}),
            school: JSON.stringify((loc as any).school ?? null),
          },
        };
      });

    src.setData({ type: "FeatureCollection", features });

    // Fit to all boundaries on the first data load after a layer change
    if (layerJustChangedRef.current && features.length > 0) {
      layerJustChangedRef.current = false;
      const allCoords = features.flatMap((f) => {
        const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
        return flatCoords(g.coordinates as unknown[]);
      });
      if (allCoords.length > 0) {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (const [lng, lat] of allCoords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        m.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, duration: 600 });
      }
    }
  }, [locationsData, styleReady]);

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

        // Fit map to selected boundary — use the boundary stored at selection time (reliable),
        // fall back to locationsRef lookup for backwards-compat.
        const boundary =
          selectedLocation.boundary ??
          locationsRef.current.find((l) => l.locationId === selectedLocation.locationId)?.map?.boundary;
        if (boundary) {
          const bbox = getBbox(boundary);
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

        // Fit to all loaded boundaries so the user sees the full picture
        const allCoords = locationsRef.current
          .filter((l) => l.map?.boundary)
          .flatMap((l) => flatCoords(l.map.boundary as unknown[]));
        if (allCoords.length > 0) {
          let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
          for (const [lng, lat] of allCoords) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
          m.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
            padding: 80,
            duration: 600,
          });
        }
      }
    } catch {
      // layers not ready
    }
  }, [selectedLocation, styleReady, mapReady]);

  // Deselect when layer changes — unless a navigation from ListingDrawer pre-loaded a location
  useEffect(() => {
    if (pendingLocationRef.current) {
      setSelectedLocation(pendingLocationRef.current);
      pendingLocationRef.current = null;
    } else {
      setSelectedLocation(null);
    }
  }, [activeLayer]);

  // Navigate from ListingDrawer location card → switch layer + select that location
  const navigateToLocation = useCallback((loc: {
    locationId: string;
    name: string;
    type: string;
    demographics?: Record<string, unknown> | null;
    school?: Record<string, unknown> | null;
    map?: { boundary?: number[][][][]; latitude?: string | number; longitude?: string | number };
  }) => {
    const sel: SelectedLocation = {
      name: loc.name,
      locationId: loc.locationId,
      demographics: (loc.demographics ?? {}) as Demographics,
      school: (loc.school ?? null) as SchoolData | null,
      boundary: loc.map?.boundary,
    };
    const targetLayer: LayerType = LOCATION_TYPE_TO_LAYER[loc.type] ?? null;
    setSelectedListing(null);
    if (targetLayer && targetLayer !== activeLayer) {
      // Store the location in the ref; the [activeLayer] effect will pick it up
      pendingLocationRef.current = sel;
      setActiveLayer(targetLayer);
    } else {
      // Same layer (or no matching layer) — set directly
      if (targetLayer && !activeLayer) setActiveLayer(targetLayer);
      setSelectedLocation(sel);
    }
  }, [activeLayer]);

  // Step 5: load and display listings for the selected boundary
  useEffect(() => {
    const m = map.current;

    const clearListingLayers = () => {
      if (!m) return;
      try {
        if (m.getLayer(LISTINGS_BLOOM)) m.removeLayer(LISTINGS_BLOOM);
        if (m.getLayer(LISTINGS_DOT)) m.removeLayer(LISTINGS_DOT);
        if (m.getSource(LISTINGS_SRC)) m.removeSource(LISTINGS_SRC);
      } catch { /* ignore */ }
    };

    if (!m || !styleReady || !selectedLocation) {
      clearListingLayers();
      listingFeaturesRef.current.clear();
      listingsResetKeyRef.current = "";
      setListingCount(null);
      setListingsLoading(false);
      return;
    }

    // Determine whether this trigger is purely a viewport change (pan/zoom) or something more
    const fullKey = [selectedLocation.locationId, activeLayer, JSON.stringify(listingFilters), listingStyleRetry].join("|");
    const prevFullKey = listingsResetKeyRef.current;
    const isBoundsOnly = prevFullKey === fullKey;
    listingsResetKeyRef.current = fullKey;

    // Location or layer change: clear existing dots immediately so stale data
    // from a previous boundary never mixes with the incoming one.
    const prevLocLayer = prevFullKey.split("|").slice(0, 2).join("|");
    const curLocLayer = `${selectedLocation.locationId}|${activeLayer}`;
    if (prevLocLayer !== curLocLayer) {
      listingFeaturesRef.current.clear();
      setListingCount(null);
      // Wipe source without removing layers so there's no teardown flash
      const existingSrc = m.getSource(LISTINGS_SRC) as maplibregl.GeoJSONSource | undefined;
      if (existingSrc) existingSrc.setData({ type: "FeatureCollection", features: [] });
    }

    const session = ++listingsSessionRef.current;
    // Do NOT reset listingsBatchRef here — batchIds must be globally unique so that
    // the bloom filter never accidentally matches features added by a previous session.
    setListingsLoading(true);

    const color = activeLayer ? LAYER_CONFIG[activeLayer].color : "#10B981";

    // Set up layers the first time (or after they were torn down)
    if (!m.getSource(LISTINGS_SRC)) {
      try {
        m.addSource(LISTINGS_SRC, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: LISTINGS_DOT,
          type: "circle",
          source: LISTINGS_SRC,
          paint: {
            "circle-color": color,
            "circle-radius": 6,
            "circle-opacity": 0.88,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "rgba(0,0,0,0.6)",
          },
        });
        m.addLayer({
          id: LISTINGS_BLOOM,
          type: "circle",
          source: LISTINGS_SRC,
          filter: ["==", ["get", "batchId"], -1],
          paint: {
            "circle-color": color,
            "circle-radius": 6,
            "circle-opacity": 0,
            "circle-stroke-width": 0,
          },
        });
      } catch (e) {
        console.warn("[Map] Style not ready for listing layers, retrying…", e);
        setListingsLoading(false);
        const timer = setTimeout(() => setListingStyleRetry((n) => n + 1), 200);
        return () => clearTimeout(timer);
      }
    }

    let animFrame: number | null = null;

    // Tracks every coord key returned by THIS fetch — used for reconciliation at the end
    const newKeySet = new Set<string>();
    // Counts every valid listing processed this fetch (may exceed unique pins due to shared coords)
    let listingsFetched = 0;

    const animateBloom = (batchNum: number) => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      m.setFilter(LISTINGS_BLOOM, ["==", ["get", "batchId"], batchNum]);

      const startTime = performance.now();
      const duration = 500;
      const startRadius = 18;
      const endRadius = 6;
      const startOpacity = 0.55;

      const frame = (now: number) => {
        if (listingsSessionRef.current !== session) return;
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        try {
          m.setPaintProperty(LISTINGS_BLOOM, "circle-radius", startRadius + (endRadius - startRadius) * ease);
          m.setPaintProperty(LISTINGS_BLOOM, "circle-opacity", startOpacity * (1 - t));
        } catch { return; }
        if (t < 1) animFrame = requestAnimationFrame(frame);
      };

      m.setPaintProperty(LISTINGS_BLOOM, "circle-radius", startRadius);
      m.setPaintProperty(LISTINGS_BLOOM, "circle-opacity", startOpacity);
      animFrame = requestAnimationFrame(frame);
    };

    // For each page: register all keys in newKeySet, only ADD points not already on map
    const addBatch = (listings: RawListing[]) => {
      if (listingsSessionRef.current !== session) return;
      const featureMap = listingFeaturesRef.current;

      const batchNum = ++listingsBatchRef.current;
      let addedAny = false;

      for (const l of listings) {
        if (listingsFetched >= MAX_MAP_POINTS) break;
        if (!l.map?.latitude || !l.map?.longitude) continue;
        listingsFetched++; // count every valid listing, even coordinate duplicates
        const key = `${l.map.longitude.toFixed(5)},${l.map.latitude.toFixed(5)}`;
        newKeySet.add(key); // always register, even if already on map

        if (featureMap.has(key)) continue; // already on map — keep it, no flicker

        featureMap.set(key, {
          type: "Feature",
          geometry: { type: "Point", coordinates: [l.map.longitude, l.map.latitude] },
          properties: { batchId: batchNum, mlsNumber: l.mlsNumber, boardId: l.boardId ?? "" },
        });
        addedAny = true;
      }

      if (!addedAny) return;

      const src = m.getSource(LISTINGS_SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "FeatureCollection", features: Array.from(featureMap.values()) });
      animateBloom(batchNum);
    };

    // After all pages: quietly remove any dot no longer in this fetch's result
    const reconcile = () => {
      if (listingsSessionRef.current !== session) return;
      const featureMap = listingFeaturesRef.current;
      let changed = false;
      for (const key of Array.from(featureMap.keys())) {
        if (!newKeySet.has(key)) {
          featureMap.delete(key);
          changed = true;
        }
      }
      if (changed) {
        const src = m.getSource(LISTINGS_SRC) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData({ type: "FeatureCollection", features: Array.from(featureMap.values()) });
      }
    };

    const fetchPage = async (pageNum: number): Promise<{ listings: RawListing[]; numPages: number; count: number }> => {
      const params = new URLSearchParams({
        locationId: selectedLocation.locationId,
        pageNum: String(pageNum),
        resultsPerPage: String(RESULTS_PER_PAGE),
      });
      if (listingFilters.listingType) params.set("type", listingFilters.listingType);
      if (listingFilters.minBeds !== null) params.set("minBeds", String(listingFilters.minBeds));
      if (listingFilters.minBaths !== null) params.set("minBaths", String(listingFilters.minBaths));
      const priceRange = listingFilters.priceKey ? PRICE_RANGES.find((r) => r.key === listingFilters.priceKey) : null;
      if (priceRange?.min !== null && priceRange?.min !== undefined) params.set("minPrice", String(priceRange.min));
      if (priceRange?.max !== null && priceRange?.max !== undefined) params.set("maxPrice", String(priceRange.max));
      // Viewport bounds only for pan/zoom — filter/location/layer changes load the full boundary
      // so that a more-restrictive filter never surfaces fewer total dots than expected.
      if (isBoundsOnly) {
        const b = m.getBounds();
        const ne = b.getNorthEast();
        const nw = b.getNorthWest();
        const sw = b.getSouthWest();
        const se = b.getSouthEast();
        params.set("mapBounds", JSON.stringify([[[ne.lng, ne.lat], [nw.lng, nw.lat], [sw.lng, sw.lat], [se.lng, se.lat]]]));
      }
      const res = await fetch(`/api/listings?${params}`);
      if (!res.ok) throw new Error(`listings fetch failed: ${res.status}`);
      return res.json();
    };

    const loadAll = async () => {
      const first = await fetchPage(1);
      if (listingsSessionRef.current !== session) return;

      const totalCount = first.count;
      addBatch(first.listings);
      setListingCount({ loaded: listingsFetched, total: totalCount });

      const totalPages = first.numPages;

      for (
        let page = 2;
        page <= totalPages && listingsFetched < MAX_MAP_POINTS;
        page += LISTINGS_CONCURRENCY
      ) {
        if (listingsSessionRef.current !== session) return;

        const pagesStillNeeded = Math.ceil((MAX_MAP_POINTS - listingsFetched) / RESULTS_PER_PAGE);
        const batchSize = Math.min(LISTINGS_CONCURRENCY, pagesStillNeeded, totalPages - page + 1);
        const batch = Array.from({ length: batchSize }, (_, i) => page + i);

        const results = await Promise.allSettled(batch.map(fetchPage));

        for (const r of results) {
          if (listingsSessionRef.current !== session) return;
          if (r.status === "fulfilled") {
            addBatch(r.value.listings);
            setListingCount({ loaded: listingsFetched, total: totalCount });
          }
        }

        await new Promise((res) => setTimeout(res, 180));
      }

      // Remove any dot not returned by this fetch (filter/zoom changed what's relevant)
      reconcile();
      setListingCount({ loaded: listingsFetched, total: totalCount });

      if (listingsSessionRef.current === session) setListingsLoading(false);
    };

    loadAll().catch((err) => {
      console.error("[Listings] load error:", err);
      if (listingsSessionRef.current === session) setListingsLoading(false);
    });

    return () => {
      listingsSessionRef.current++;
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      setListingsLoading(false);
    };
  }, [selectedLocation, styleReady, mapReady, activeLayer, listingFilters, listingStyleRetry, listingBoundsKey]);

  // Popup CSS (just for popups we may add later — kept as baseline)
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .maplibregl-popup-content { background:#09090b !important; border:1px solid #27272a; border-radius:6px; padding:0; box-shadow:0 8px 24px rgb(0 0 0/.7); }
      .maplibregl-popup-tip { display:none; }
      .boundary-tooltip .maplibregl-popup-content {
        padding: 5px 10px;
        background: rgba(9,9,11,0.92) !important;
        border: 1px solid #3f3f46;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgb(0 0 0/.6);
        pointer-events: none;
      }
      .boundary-tooltip .maplibregl-popup-content span {
        font-size: 12px;
        font-weight: 500;
        color: #e4e4e7;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
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
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-3 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}repliers-logo.webp`} alt="Repliers" className="h-5 w-auto object-contain" />
          <div className="w-px h-5 bg-zinc-700 flex-shrink-0" />
          <img src={`${import.meta.env.BASE_URL}liveby-logo.png`} alt="LiveBy" className="h-5 w-auto object-contain" />
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

        {selectedLocation && (() => {
          const color = layerCfg?.color ?? "#10B981";
          const btnBase = "text-[10px] font-medium py-1 rounded transition-colors border ";
          const btnOff = btnBase + "text-zinc-500 bg-zinc-900 border-zinc-800 hover:text-zinc-300 hover:border-zinc-600";
          const btnOn  = (c: string) => btnBase + `text-zinc-100 border-transparent` + ` bg-[${c}]/20 border-[${c}]`;
          const filterBtn = (active: boolean, c: string) => active ? btnOn(c) : btnOff;

          const setType = (t: "Sale" | "Lease") =>
            setListingFilters((f) => ({ ...f, listingType: f.listingType === t ? null : t }));
          const setBeds = (n: number) =>
            setListingFilters((f) => ({ ...f, minBeds: f.minBeds === n ? null : n }));
          const setBaths = (n: number) =>
            setListingFilters((f) => ({ ...f, minBaths: f.minBaths === n ? null : n }));
          const setPrice = (k: PriceKey) =>
            setListingFilters((f) => ({ ...f, priceKey: f.priceKey === k ? null : k }));

          return (
            <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-lg w-52 overflow-hidden">
              {/* Count header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/60">
                <Home className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                {listingsLoading ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="w-3 h-3 text-zinc-500 animate-spin flex-shrink-0" />
                    <span className="text-xs text-zinc-400 truncate">
                      {listingCount
                        ? <><span className="text-zinc-200 font-medium">{listingCount.total.toLocaleString()}</span>{" listings"}</>
                        : "Loading…"}
                    </span>
                  </div>
                ) : listingCount ? (
                  <span className="text-xs text-zinc-400">
                    {listingCount.loaded < listingCount.total
                      ? <><span className="text-zinc-200 font-medium">Showing {listingCount.loaded.toLocaleString()}</span>{" of "}{listingCount.total.toLocaleString()}</>
                      : <span className="text-zinc-200 font-medium">{listingCount.total.toLocaleString()}</span>
                    }
                    {" listings"}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">Listings</span>
                )}
              </div>

              <div className="px-3 py-2.5 flex flex-col gap-2.5">
                {/* Type */}
                <div>
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Type</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(["Sale", "Lease"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setType(t)}
                        className={filterBtn(listingFilters.listingType === t, color)}
                        style={listingFilters.listingType === t ? { backgroundColor: color + "33", borderColor: color, color: "#f4f4f5" } : undefined}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                {/* Beds */}
                <div>
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Beds</p>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setBeds(n)}
                        className={filterBtn(listingFilters.minBeds === n, color)}
                        style={listingFilters.minBeds === n ? { backgroundColor: color + "33", borderColor: color, color: "#f4f4f5" } : undefined}
                      >{n}+</button>
                    ))}
                  </div>
                </div>

                {/* Baths */}
                <div>
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Baths</p>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setBaths(n)}
                        className={filterBtn(listingFilters.minBaths === n, color)}
                        style={listingFilters.minBaths === n ? { backgroundColor: color + "33", borderColor: color, color: "#f4f4f5" } : undefined}
                      >{n}+</button>
                    ))}
                  </div>
                </div>

                {/* Price */}
                <div>
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Price</p>
                  <div className="grid grid-cols-2 gap-1">
                    {PRICE_RANGES.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => setPrice(r.key)}
                        className={filterBtn(listingFilters.priceKey === r.key, color)}
                        style={listingFilters.priceKey === r.key ? { backgroundColor: color + "33", borderColor: color, color: "#f4f4f5" } : undefined}
                      >{r.label}</button>
                    ))}
                  </div>
                </div>

                {/* Clear filters */}
                {(listingFilters.listingType || listingFilters.minBeds || listingFilters.minBaths || listingFilters.priceKey) && (
                  <button
                    onClick={() => setListingFilters(DEFAULT_FILTERS)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors text-left"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Listing detail drawer */}
      <ListingDrawer
        mlsNumber={selectedListing?.mlsNumber ?? null}
        boardId={selectedListing?.boardId ?? ""}
        onClose={() => setSelectedListing(null)}
        onLocationSelect={navigateToLocation}
      />

      {/* Unified drawer — Demographics, School Details, and Market Statistics tabs */}
      {layerCfg && (
        <LocationDrawer
          open={!!selectedLocation && !selectedListing}
          name={selectedLocation?.name ?? ""}
          locationId={selectedLocation?.locationId ?? ""}
          listingType={listingFilters.listingType}
          layerLabel={layerCfg.label}
          layerColor={layerCfg.color}
          activeLayer={activeLayer}
          demographics={selectedLocation?.demographics ?? {}}
          school={selectedLocation?.school ?? null}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  );
}
