import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { X, Users, BookOpen, Phone, Globe, Star } from "lucide-react";

export type SchoolData = {
  schoolName?: string;
  districtName?: string | null;
  phone?: string | null;
  website?: string | null;
  metrics?: {
    rankHistory?: Array<{
      year: number;
      rank: number;
      rankOf: number;
      rankStars: number;
      rankLevel: string;
    }>;
    schoolYearlyDetails?: Array<{
      year: number;
      numberOfStudents?: number;
      percentFreeDiscLunch?: number;
      percentofAfricanAmericanStudents?: number;
      percentofAsianStudents?: number;
      percentofHispanicStudents?: number;
      percentofIndianStudents?: number;
      percentofWhiteStudents?: number;
      percentofTwoOrMoreRaceStudents?: number;
      teachersFulltime?: number;
      pupilTeacherRatio?: number;
    }>;
  };
};

type Props = {
  open: boolean;
  name: string;
  layerColor: string;
  school: SchoolData;
  onClose: () => void;
};

const MUTED = "#52525b";
const TEXT = "#e4e4e7";
const SUBTEXT = "#71717a";
const PURPLE = "#8B5CF6";
const GREEN = "#34D399";
const AMBER = "#FBBF24";

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-zinc-100 text-lg font-bold leading-tight">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">{children}</h3>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 shadow-lg">
      <div className="font-medium">{label}</div>
      <div className="font-bold" style={{ color: payload[0].color ?? PURPLE }}>
        {payload[0].name === "percentile"
          ? `${Number(payload[0].value).toFixed(0)}th %ile`
          : Number(payload[0].value).toLocaleString()}
      </div>
    </div>
  );
};

function HorizBar({
  label, value, max, color = PURPLE,
}: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="text-[11px] text-zinc-300 font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className="w-3.5 h-3.5"
          fill={s <= stars ? AMBER : "transparent"}
          stroke={s <= stars ? AMBER : MUTED}
        />
      ))}
      <span className="text-[10px] text-zinc-500 ml-1">{stars}/5</span>
    </div>
  );
}

export default function SchoolDrawer({ open, name, layerColor, school, onClose }: Props) {
  const rankHistory = (school.metrics?.rankHistory ?? [])
    .filter((r) => r.rank > 0 && r.rankOf > 0)
    .sort((a, b) => a.year - b.year);

  const rankChartData = rankHistory.map((r) => ({
    year: String(r.year),
    percentile: Math.round(((r.rankOf - r.rank) / r.rankOf) * 100),
    rankStars: r.rankStars,
  }));

  const yearlyDetails = (school.metrics?.schoolYearlyDetails ?? [])
    .sort((a, b) => b.year - a.year);

  const latestYear = yearlyDetails[0];
  const latestRank = rankHistory.length > 0 ? rankHistory[rankHistory.length - 1] : undefined;

  const enrollmentData = [...yearlyDetails]
    .reverse()
    .filter((y) => (y.numberOfStudents ?? 0) > 0)
    .map((y) => ({ year: String(y.year), students: y.numberOfStudents ?? 0 }));

  const diversityItems = latestYear
    ? [
        { label: "Hispanic", value: latestYear.percentofHispanicStudents ?? 0, color: GREEN },
        { label: "Black", value: latestYear.percentofAfricanAmericanStudents ?? 0, color: PURPLE },
        { label: "White", value: latestYear.percentofWhiteStudents ?? 0, color: "#60A5FA" },
        { label: "Asian", value: latestYear.percentofAsianStudents ?? 0, color: AMBER },
        { label: "2+ Races", value: latestYear.percentofTwoOrMoreRaceStudents ?? 0, color: "#F472B6" },
        { label: "Native Am.", value: latestYear.percentofIndianStudents ?? 0, color: "#FB923C" },
      ].filter((x) => x.value > 0)
    : [];

  const axisStyle = { fontSize: 10, fill: SUBTEXT };
  const yAxisStyle = { fontSize: 10, fill: SUBTEXT };

  const displayName = school.schoolName || name;
  const gradeLevel = latestRank?.rankLevel ?? "";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100%",
        width: 380,
        zIndex: 20,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        display: "flex",
        flexDirection: "column",
        background: "#09090b",
        borderLeft: "1px solid #27272a",
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.6)" : "none",
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-800">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1"
              style={{ backgroundColor: layerColor + "22", color: layerColor }}
            >
              {gradeLevel ? `${gradeLevel} School` : "School"}
            </div>
            <h2 className="text-base font-bold text-zinc-100 leading-snug">{displayName}</h2>
            {school.districtName && (
              <p className="text-xs text-zinc-500 mt-0.5">{school.districtName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 mt-0.5 p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contact row */}
        <div className="flex items-center gap-3 mb-3">
          {school.phone && (
            <a
              href={`tel:${school.phone}`}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Phone className="w-3 h-3" />
              {school.phone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
            </a>
          )}
          {school.website && (
            <a
              href={school.website.startsWith("http") ? school.website : `https://${school.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Globe className="w-3 h-3" />
              Website
            </a>
          )}
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={<Users className="w-3 h-3" />}
            label="Students"
            value={latestYear?.numberOfStudents != null ? latestYear.numberOfStudents.toLocaleString() : "—"}
          />
          <StatCard
            icon={<BookOpen className="w-3 h-3" />}
            label="Pupil : Teacher"
            value={latestYear?.pupilTeacherRatio != null ? `${latestYear.pupilTeacherRatio} : 1` : "—"}
          />
          <StatCard
            icon={<Star className="w-3 h-3" />}
            label="State Rank"
            value={
              latestRank
                ? `#${latestRank.rank.toLocaleString()} of ${latestRank.rankOf.toLocaleString()}`
                : "—"
            }
          />
          <StatCard
            icon={<Users className="w-3 h-3" />}
            label="Free Lunch"
            value={
              latestYear?.percentFreeDiscLunch != null
                ? `${latestYear.percentFreeDiscLunch.toFixed(0)}%`
                : "—"
            }
          />
        </div>

        {/* Star rating */}
        {latestRank && latestRank.rankStars >= 0 && (
          <div className="mt-2">
            <StarRating stars={latestRank.rankStars} />
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Rank Percentile History */}
        {rankChartData.length > 1 && (
          <div>
            <SectionTitle>State Rank Percentile (higher = better)</SectionTitle>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={rankChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="year" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis
                  tick={yAxisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#3f3f46" }} />
                <Line
                  type="monotone"
                  dataKey="percentile"
                  stroke={PURPLE}
                  strokeWidth={2}
                  dot={{ fill: PURPLE, r: 3 }}
                  activeDot={{ r: 5 }}
                  name="percentile"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Enrollment Trend */}
        {enrollmentData.length > 1 && (
          <div>
            <SectionTitle>Student Enrollment</SectionTitle>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={enrollmentData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="year" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis
                  tick={yAxisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v))}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#27272a" }} />
                <Bar dataKey="students" radius={[3, 3, 0, 0]} fill={GREEN} name="students" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Student Diversity */}
        {diversityItems.length > 0 && (
          <div>
            <SectionTitle>Student Diversity ({latestYear?.year})</SectionTitle>
            {diversityItems.map((item) => (
              <HorizBar key={item.label} label={item.label} value={item.value} max={100} color={item.color} />
            ))}
          </div>
        )}

        {/* Attribution */}
        <p className="text-[10px] text-zinc-700 pb-2">Source: Repliers School Data</p>
      </div>
    </div>
  );
}
