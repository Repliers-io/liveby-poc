import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, Bed, Bath, SquareIcon, Home, Calendar, Clock } from "lucide-react";

const CDN = "https://cdn.repliers.io/";

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationEntry = {
  locationId: string;
  type: string;
  subType: string | null;
  name: string;
  address?: {
    city?: string;
    state?: string;
    zip?: string;
    street?: string;
    neighborhood?: string;
    area?: string;
  };
  map: {
    latitude: string | number;
    longitude: string | number;
    geometryType?: string;
    boundary?: number[][][][];
  };
  size?: number;
};

type ListingDetail = {
  mlsNumber: string;
  listPrice: number | null;
  soldPrice: number | null;
  originalPrice: number | null;
  status: string;
  lastStatus: string;
  standardStatus: string;
  type: string;
  listDate: string | null;
  soldDate: string | null;
  daysOnMarket: number | null;
  simpleDaysOnMarket: number | null;
  boardId: string | number;
  images: string[];
  map?: { latitude: string | number; longitude: string | number };
  address: {
    streetNumber?: string;
    streetName?: string;
    streetSuffix?: string;
    unitNumber?: string;
    city?: string;
    state?: string;
    zip?: string;
    neighborhood?: string;
  };
  details: {
    numBedrooms?: number | string;
    numBedroomsPlus?: number | string;
    numBathrooms?: number | string;
    numBathroomsPlus?: number | string;
    sqft?: number | string;
    propertyType?: string;
    description?: string;
    extras?: string;
  };
  agents?: Array<{
    name?: string;
    email?: string;
    brokerage?: { name?: string };
  }>;
  office?: { brokerageName?: string };
  locations?: LocationEntry[];
};

// ─── Location type config ──────────────────────────────────────────────────────

const TYPE_ORDER = [
  "neighborhood", "postalCode", "district", "area",
  "schoolDistrict", "city", "city-alternate", "school",
];

const TYPE_LABELS: Record<string, string> = {
  school: "School",
  neighborhood: "Neighbourhood",
  city: "City",
  "city-alternate": "City Area",
  area: "County",
  postalCode: "Postal Code",
  district: "District",
  schoolDistrict: "School District",
};

const TYPE_COLORS: Record<string, string> = {
  school: "#f59e0b",
  neighborhood: "#22d3ee",
  city: "#a78bfa",
  "city-alternate": "#a78bfa",
  area: "#34d399",
  postalCode: "#60a5fa",
  district: "#fb923c",
  schoolDistrict: "#fbbf24",
};

function typeColor(type: string) {
  return TYPE_COLORS[type] ?? "#94a3b8";
}

function typeLabel(type: string) {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

// ─── SVG boundary mini-map ────────────────────────────────────────────────────

function BoundaryMiniMap({
  boundary: rawBoundary,
  color,
  propLat,
  propLng,
}: {
  boundary: number[][][] | number[][][][];
  color: string;
  propLat?: number;
  propLng?: number;
}) {
  const W = 340;
  const H = 160;
  const PAD = 12;

  const { paths, dotX, dotY } = useMemo(() => {
    // Normalise Polygon vs MultiPolygon: detect by checking if boundary[0][0][0] is a number.
    // Polygon:      [ring][point] = [lng, lat]  → depth-3
    // MultiPolygon: [polygon][ring][point] = [lng, lat] → depth-4
    const isPolygon = !Array.isArray((rawBoundary as number[][][][])?.[0]?.[0]?.[0]);
    const boundary: number[][][][] = isPolygon
      ? [rawBoundary as number[][][]]
      : (rawBoundary as number[][][][]);

    // Flatten all coordinates to find bounds
    const pts: [number, number][] = [];
    for (const polygon of boundary) {
      for (const ring of polygon) {
        for (const c of ring) pts.push([c[0], c[1]]);
      }
    }

    if (pts.length === 0) return { paths: [], dotX: null, dotY: null };

    const minLng = Math.min(...pts.map((p) => p[0]));
    const maxLng = Math.max(...pts.map((p) => p[0]));
    const minLat = Math.min(...pts.map((p) => p[1]));
    const maxLat = Math.max(...pts.map((p) => p[1]));

    const lngSpan = maxLng - minLng || 0.001;
    const latSpan = maxLat - minLat || 0.001;

    // Preserve aspect ratio with letterbox
    const drawW = W - PAD * 2;
    const drawH = H - PAD * 2;
    const scaleX = drawW / lngSpan;
    const scaleY = drawH / latSpan;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = PAD + (drawW - lngSpan * scale) / 2;
    const offsetY = PAD + (drawH - latSpan * scale) / 2;

    const project = (lng: number, lat: number): [number, number] => [
      offsetX + (lng - minLng) * scale,
      H - offsetY - (lat - minLat) * scale,
    ];

    const builtPaths: string[] = [];
    for (const polygon of boundary) {
      for (const ring of polygon) {
        const coords = ring.map(([lng, lat]) => project(lng, lat).join(","));
        builtPaths.push(`M${coords.join("L")}Z`);
      }
    }

    let dotX: number | null = null;
    let dotY: number | null = null;
    if (propLng != null && propLat != null) {
      [dotX, dotY] = project(propLng, propLat);
    }

    return { paths: builtPaths, dotX, dotY };
  }, [rawBoundary, propLat, propLng]);

  if (paths.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block", background: "#0f0f0f", borderRadius: 8 }}
    >
      {/* Grid dots for map feel */}
      <pattern id="grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="0.8" fill="#2a2a2a" />
      </pattern>
      <rect width={W} height={H} fill="url(#grid)" />

      {paths.map((d, i) => (
        <path key={i} d={d} fill={color + "2a"} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      ))}

      {dotX != null && dotY != null && (
        <>
          <circle cx={dotX} cy={dotY} r={6} fill={color} opacity={0.25} />
          <circle cx={dotX} cy={dotY} r={3} fill="#f4f4f5" />
        </>
      )}
    </svg>
  );
}

// ─── Locations section ─────────────────────────────────────────────────────────

function LocationsSection({
  locations,
  propLat,
  propLng,
}: {
  locations: LocationEntry[];
  propLat?: number;
  propLng?: number;
}) {
  // Group by type in display order
  const grouped = useMemo(() => {
    const map = new Map<string, LocationEntry[]>();
    for (const loc of locations) {
      const arr = map.get(loc.type) ?? [];
      arr.push(loc);
      map.set(loc.type, arr);
    }
    const ordered: Array<{ type: string; entries: LocationEntry[] }> = [];
    for (const type of TYPE_ORDER) {
      if (map.has(type)) ordered.push({ type, entries: map.get(type)! });
    }
    // Append any unknown types
    for (const [type, entries] of map) {
      if (!TYPE_ORDER.includes(type)) ordered.push({ type, entries });
    }
    return ordered;
  }, [locations]);

  if (grouped.length === 0) return null;

  return (
    <Section title="Locations">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {grouped.map(({ type, entries }) => (
          <div key={type}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: typeColor(type),
              textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
            }}>
              {typeLabel(type)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {entries.map((loc) => {
                const boundary = loc.map?.boundary;
                const clat = parseFloat(String(loc.map?.latitude));
                const clng = parseFloat(String(loc.map?.longitude));
                return (
                  <div key={loc.locationId} style={{
                    background: "#27272a",
                    borderRadius: 10,
                    overflow: "hidden",
                    border: `1px solid ${typeColor(loc.type)}33`,
                  }}>
                    {boundary && boundary.length > 0 && (
                      <BoundaryMiniMap
                        boundary={boundary}
                        color={typeColor(loc.type)}
                        propLat={propLat ?? clat}
                        propLng={propLng ?? clng}
                      />
                    )}
                    <div style={{ padding: "8px 12px 10px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f4f5" }}>{loc.name}</div>
                      {loc.address?.city && (
                        <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>
                          {[loc.address.street, loc.address.city, loc.address.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {loc.size != null && (
                        <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>
                          {loc.size.toFixed(1)} km²
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function fetchListing(mlsNumber: string, boardId: string): Promise<ListingDetail> {
  const params = new URLSearchParams({ boardId });
  const res = await fetch(`/api/listing/${encodeURIComponent(mlsNumber)}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch listing: ${res.status}`);
  return res.json();
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(listing: ListingDetail) {
  const s = (listing.standardStatus || listing.lastStatus || listing.status || "").toLowerCase();
  if (s.includes("sold") || s === "sld") return { label: "Sold", bg: "#dc2626" };
  if (s.includes("leased") || s === "lsd") return { label: "Leased", bg: "#7c3aed" };
  if (s.includes("active") || s === "a" || s === "new") return { label: listing.lastStatus || "Active", bg: "#16a34a" };
  return { label: listing.standardStatus || listing.status, bg: "#6b7280" };
}

// ─── Main drawer ───────────────────────────────────────────────────────────────

type Props = {
  mlsNumber: string | null;
  boardId: string;
  onClose: () => void;
};

export default function ListingDrawer({ mlsNumber, boardId, onClose }: Props) {
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => { setPhotoIdx(0); }, [mlsNumber]);

  const { data, isLoading, isError } = useQuery<ListingDetail>({
    queryKey: ["listing", mlsNumber, boardId],
    queryFn: () => fetchListing(mlsNumber!, boardId),
    enabled: !!mlsNumber,
    staleTime: 5 * 60 * 1000,
  });

  const open = !!mlsNumber;

  const photos = (data?.images ?? []).map((p) =>
    p.startsWith("http") ? p : `${CDN}${p}`
  );
  const safeIdx = photos.length ? photoIdx % photos.length : 0;
  const badge = data ? statusBadge(data) : null;

  const addr = data?.address ?? {};
  const details = data?.details ?? {};
  const agent = data?.agents?.[0];
  const brokerage = agent?.brokerage?.name ?? data?.office?.brokerageName;

  const beds = details.numBedrooms;
  const bedsPlus = details.numBedroomsPlus;
  const baths = details.numBathrooms;
  const bathsPlus = details.numBathroomsPlus;
  const dom = data?.simpleDaysOnMarket ?? data?.daysOnMarket;

  const propLat = data?.map?.latitude != null ? parseFloat(String(data.map.latitude)) : undefined;
  const propLng = data?.map?.longitude != null ? parseFloat(String(data.map.longitude)) : undefined;

  const streetLine = [addr.streetNumber, addr.unitNumber ? `#${addr.unitNumber}` : null, addr.streetName, addr.streetSuffix]
    .filter(Boolean).join(" ");
  const cityLine = [addr.city, addr.state, addr.zip].filter(Boolean).join(", ");

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: "#18181b",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.6)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflowY: "auto",
      }}
    >
      {/* Photo carousel */}
      <div style={{ position: "relative", width: "100%", height: 240, background: "#27272a", flexShrink: 0 }}>
        {photos.length > 0 ? (
          <>
            <img
              key={photos[safeIdx]}
              src={photos[safeIdx]}
              alt="Listing"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                  style={{
                    position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                    background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 9999,
                    width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <ChevronLeft size={18} color="#fff" />
                </button>
                <button
                  onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 9999,
                    width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <ChevronRight size={18} color="#fff" />
                </button>
                <div style={{
                  position: "absolute", bottom: 8, right: 10,
                  background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11,
                  padding: "2px 7px", borderRadius: 9999,
                }}>
                  {safeIdx + 1} / {photos.length}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={48} color="#52525b" />
          </div>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 10, right: 10,
            background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 9999,
            width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={16} color="#fff" />
        </button>

        {badge && (
          <div style={{
            position: "absolute", top: 10, left: 10,
            background: badge.bg, color: "#fff", fontSize: 11, fontWeight: 700,
            padding: "3px 9px", borderRadius: 9999, letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            {badge.label}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "16px 16px 24px", flex: 1 }}>
        {isLoading && (
          <div style={{ color: "#a1a1aa", textAlign: "center", paddingTop: 40 }}>Loading…</div>
        )}
        {isError && (
          <div style={{ color: "#f87171", textAlign: "center", paddingTop: 40 }}>Failed to load listing.</div>
        )}
        {data && (
          <>
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#f4f4f5" }}>
                {fmt(data.soldPrice ?? data.listPrice)}
              </span>
              {data.soldPrice && data.listPrice && data.soldPrice !== data.listPrice && (
                <span style={{ fontSize: 13, color: "#a1a1aa", marginLeft: 8 }}>
                  Listed {fmt(data.listPrice)}
                </span>
              )}
            </div>

            {streetLine && (
              <div style={{ fontSize: 14, color: "#d4d4d8", marginBottom: 2 }}>{streetLine}</div>
            )}
            {cityLine && (
              <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12 }}>{cityLine}</div>
            )}

            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
              {beds != null && (
                <StatPill icon={<Bed size={14} />} label={`${beds}${bedsPlus ? `+${bedsPlus}` : ""} bed`} />
              )}
              {baths != null && (
                <StatPill icon={<Bath size={14} />} label={`${baths}${bathsPlus ? `+${bathsPlus}` : ""} bath`} />
              )}
              {details.sqft && (
                <StatPill icon={<SquareIcon size={14} />} label={`${Number(details.sqft).toLocaleString()} sqft`} />
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", marginBottom: 16 }}>
              {details.propertyType && <Detail label="Type" value={details.propertyType} />}
              {dom != null && <Detail label="Days on market" value={`${dom} days`} icon={<Clock size={12} />} />}
              {data.listDate && <Detail label="Listed" value={fmtDate(data.listDate)} icon={<Calendar size={12} />} />}
              {data.soldDate && <Detail label="Sold" value={fmtDate(data.soldDate)} icon={<Calendar size={12} />} />}
              {addr.neighborhood && <Detail label="Neighbourhood" value={addr.neighborhood} />}
              <Detail label="MLS#" value={data.mlsNumber} />
            </div>

            {details.description && (
              <Section title="Description">
                <p style={{ fontSize: 13, color: "#d4d4d8", lineHeight: 1.6, margin: 0 }}>
                  {details.description}
                </p>
              </Section>
            )}

            {details.extras && (
              <Section title="Extras">
                <p style={{ fontSize: 13, color: "#d4d4d8", lineHeight: 1.6, margin: 0 }}>{details.extras}</p>
              </Section>
            )}

            {(agent?.name || brokerage) && (
              <Section title="Listing agent">
                {agent?.name && <div style={{ fontSize: 13, color: "#d4d4d8", fontWeight: 600 }}>{agent.name}</div>}
                {brokerage && <div style={{ fontSize: 12, color: "#a1a1aa" }}>{brokerage}</div>}
                {agent?.email && (
                  <a href={`mailto:${agent.email}`} style={{ fontSize: 12, color: "#60a5fa" }}>{agent.email}</a>
                )}
              </Section>
            )}

            {data.locations && data.locations.length > 0 && (
              <LocationsSection
                locations={data.locations}
                propLat={propLat}
                propLng={propLng}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────────

function StatPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#d4d4d8", fontSize: 13 }}>
      <span style={{ color: "#71717a" }}>{icon}</span>
      {label}
    </div>
  );
}

function Detail({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#d4d4d8", display: "flex", alignItems: "center", gap: 4 }}>
        {icon && <span style={{ color: "#71717a" }}>{icon}</span>}
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: "#71717a",
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}
