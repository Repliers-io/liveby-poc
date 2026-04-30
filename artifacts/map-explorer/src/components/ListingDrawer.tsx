import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, Bed, Bath, SquareIcon, Home, Calendar, Clock } from "lucide-react";

const CDN = "https://cdn.repliers.io/";

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
};

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

  const streetLine = [addr.streetNumber, addr.unitNumber ? `#${addr.unitNumber}` : null, addr.streetName, addr.streetSuffix]
    .filter(Boolean).join(" ");
  const cityLine = [addr.city, addr.state, addr.zip].filter(Boolean).join(", ");

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: 380,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: "#18181b",
        boxShadow: "4px 0 24px rgba(0,0,0,0.6)",
        transform: open ? "translateX(0)" : "translateX(-100%)",
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

        {/* Close button */}
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

        {/* Status badge */}
        {badge && (
          <div style={{
            position: "absolute", top: 10, left: 10,
            background: badge.bg, color: "#fff", fontSize: 11, fontWeight: 700,
            padding: "3px 9px", borderRadius: 9999, letterSpacing: "0.05em",
            textTransform: "uppercase",
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
            {/* Price */}
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

            {/* Address */}
            {streetLine && (
              <div style={{ fontSize: 14, color: "#d4d4d8", marginBottom: 2 }}>{streetLine}</div>
            )}
            {cityLine && (
              <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12 }}>{cityLine}</div>
            )}

            {/* Key stats row */}
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

            {/* Details grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", marginBottom: 16 }}>
              {details.propertyType && <Detail label="Type" value={details.propertyType} />}
              {dom != null && <Detail label="Days on market" value={`${dom} days`} icon={<Clock size={12} />} />}
              {data.listDate && <Detail label="Listed" value={fmtDate(data.listDate)} icon={<Calendar size={12} />} />}
              {data.soldDate && <Detail label="Sold" value={fmtDate(data.soldDate)} icon={<Calendar size={12} />} />}
              {addr.neighborhood && <Detail label="Neighbourhood" value={addr.neighborhood} />}
              <Detail label="MLS#" value={data.mlsNumber} />
            </div>

            {/* Description */}
            {details.description && (
              <Section title="Description">
                <p style={{ fontSize: 13, color: "#d4d4d8", lineHeight: 1.6, margin: 0 }}>
                  {details.description}
                </p>
              </Section>
            )}

            {/* Extras */}
            {details.extras && (
              <Section title="Extras">
                <p style={{ fontSize: 13, color: "#d4d4d8", lineHeight: 1.6, margin: 0 }}>{details.extras}</p>
              </Section>
            )}

            {/* Agent */}
            {(agent?.name || brokerage) && (
              <Section title="Listing agent">
                {agent?.name && <div style={{ fontSize: 13, color: "#d4d4d8", fontWeight: 600 }}>{agent.name}</div>}
                {brokerage && <div style={{ fontSize: 12, color: "#a1a1aa" }}>{brokerage}</div>}
                {agent?.email && (
                  <a href={`mailto:${agent.email}`} style={{ fontSize: 12, color: "#60a5fa" }}>{agent.email}</a>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
      <div style={{ fontSize: 11, fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
