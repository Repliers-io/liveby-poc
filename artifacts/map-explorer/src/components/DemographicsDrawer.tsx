import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell,
} from "recharts";
import { X, Users, DollarSign, Home, Clock } from "lucide-react";

export type Demographics = {
  population?: number;
  medianAge?: number;
  medianIncome?: number;
  medianHouseValue?: number;
  populationDensity?: number;
  percentMale?: number;
  percentFemale?: number;
  age?: {
    byLifeStage?: Record<string, number>;
    byCohort?: Record<string, number>;
  };
  income?: {
    byLevel?: Record<string, number>;
  };
  education?: {
    noDegree?: number;
    highSchool?: number;
    collegeBelowBachelor?: number;
    bachelor?: number;
    master?: number;
    doctorate?: number;
  };
  homeValue?: Record<string, number>;
  occupancy?: {
    unitOccupiedOwner?: number;
    unitOccupiedRenter?: number;
    absenteeOwner?: number;
    vacant?: number;
  };
  commuteTime?: {
    under15Minutes?: number;
    between15To29Minutes?: number;
    between30To59Minutes?: number;
    over60Minutes?: number;
  };
  jobType?: { blueCollar?: number; whiteCollar?: number };
};

type Props = {
  open: boolean;
  name: string;
  layerLabel: string;
  layerColor: string;
  demographics: Demographics;
  onClose: () => void;
};

const CHART_COLOR = "#818CF8";
const MUTED = "#52525b";
const TEXT = "#e4e4e7";
const SUBTEXT = "#71717a";

function fmt(n: number | null | undefined, prefix = "", decimals = 0) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(decimals === 0 ? 0 : decimals)}K`;
  return `${prefix}${n.toLocaleString()}`;
}

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
      <div className="text-indigo-400 font-bold">{Number(payload[0].value).toLocaleString()}</div>
    </div>
  );
};

function HorizBar({ label, value, max, color = CHART_COLOR }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="text-[11px] text-zinc-300 font-medium">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function DemographicsDrawer({ open, name, layerLabel, layerColor, demographics: d, onClose }: Props) {
  // Age by life stage
  const ageData = d.age?.byLifeStage
    ? [
        { name: "0–9", value: d.age.byLifeStage.between0To9 ?? 0 },
        { name: "10–17", value: d.age.byLifeStage.between10To17 ?? 0 },
        { name: "18–24", value: d.age.byLifeStage.between18To24 ?? 0 },
        { name: "25–64", value: d.age.byLifeStage.between25To64 ?? 0 },
        { name: "65–74", value: d.age.byLifeStage.between65To74 ?? 0 },
        { name: "75+", value: d.age.byLifeStage.between75AndOver ?? 0 },
      ]
    : [];

  // Income by level
  const incomeData = d.income?.byLevel
    ? [
        { name: "<$25K", value: d.income.byLevel.between0To25000 ?? 0 },
        { name: "$25–35K", value: d.income.byLevel.between25000To35000 ?? 0 },
        { name: "$35–50K", value: d.income.byLevel.between35000To50000 ?? 0 },
        { name: "$50–75K", value: d.income.byLevel.between50000To75000 ?? 0 },
        { name: "$75–100K", value: d.income.byLevel.between75000To100000 ?? 0 },
        { name: ">$100K", value: d.income.byLevel.over100000 ?? 0 },
      ]
    : [];

  // Education
  const edu = d.education ?? {};
  const eduTotal =
    (edu.noDegree ?? 0) +
    (edu.highSchool ?? 0) +
    (edu.collegeBelowBachelor ?? 0) +
    (edu.bachelor ?? 0) +
    (edu.master ?? 0) +
    (edu.doctorate ?? 0);
  const eduItems = [
    { label: "No Degree", value: edu.noDegree ?? 0 },
    { label: "High School", value: edu.highSchool ?? 0 },
    { label: "Some College", value: edu.collegeBelowBachelor ?? 0 },
    { label: "Bachelor's", value: edu.bachelor ?? 0 },
    { label: "Master's", value: edu.master ?? 0 },
    { label: "Doctorate", value: edu.doctorate ?? 0 },
  ];

  // Occupancy
  const occ = d.occupancy ?? {};
  const occData = [
    { name: "Owner", value: occ.unitOccupiedOwner ?? 0, color: "#818CF8" },
    { name: "Renter", value: occ.unitOccupiedRenter ?? 0, color: "#34D399" },
    { name: "Absent Owner", value: occ.absenteeOwner ?? 0, color: "#FBBF24" },
    { name: "Vacant", value: occ.vacant ?? 0, color: "#F87171" },
  ].filter((x) => x.value > 0);
  const occTotal = occData.reduce((s, x) => s + x.value, 0);

  // Commute
  const ct = d.commuteTime ?? {};
  const commuteData = [
    { name: "<15 min", value: ct.under15Minutes ?? 0 },
    { name: "15–29 min", value: ct.between15To29Minutes ?? 0 },
    { name: "30–59 min", value: ct.between30To59Minutes ?? 0 },
    { name: "60+ min", value: ct.over60Minutes ?? 0 },
  ];

  // Home values
  const hv = d.homeValue ?? {};
  const homeValueData = [
    { name: "<$100K", value: hv.below100000 ?? 0 },
    { name: "$100–150K", value: hv.between100000To150000 ?? 0 },
    { name: "$150–200K", value: hv.between150000To200000 ?? 0 },
    { name: "$200–300K", value: hv.between200000To300000 ?? 0 },
    { name: "$300–500K", value: hv.between300000To500000 ?? 0 },
    { name: ">$500K", value: hv.above500000 ?? 0 },
  ];

  const chartProps = {
    margin: { top: 4, right: 4, left: -20, bottom: 0 },
  };
  const axisStyle = { fontSize: 10, fill: SUBTEXT };
  const yAxisStyle = { fontSize: 10, fill: SUBTEXT };

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
              {layerLabel}
            </div>
            <h2 className="text-base font-bold text-zinc-100 leading-snug truncate">{name}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 mt-0.5 p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={<Users className="w-3 h-3" />}
            label="Population"
            value={fmt(d.population)}
          />
          <StatCard
            icon={<Clock className="w-3 h-3" />}
            label="Median Age"
            value={d.medianAge != null ? `${d.medianAge} yrs` : "—"}
          />
          <StatCard
            icon={<DollarSign className="w-3 h-3" />}
            label="Median Income"
            value={fmt(d.medianIncome, "$")}
          />
          <StatCard
            icon={<Home className="w-3 h-3" />}
            label="Median Home"
            value={fmt(d.medianHouseValue, "$")}
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Age Distribution */}
        {ageData.length > 0 && (
          <div>
            <SectionTitle>Age Distribution</SectionTitle>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={ageData} {...chartProps}>
                <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={yAxisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#27272a" }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={CHART_COLOR} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Income Distribution */}
        {incomeData.length > 0 && (
          <div>
            <SectionTitle>Household Income</SectionTitle>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={incomeData} {...chartProps}>
                <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={yAxisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#27272a" }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="#34D399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Education */}
        {eduTotal > 0 && (
          <div>
            <SectionTitle>Education</SectionTitle>
            {eduItems.map((e) => (
              <HorizBar key={e.label} label={e.label} value={e.value} max={eduTotal} color={CHART_COLOR} />
            ))}
          </div>
        )}

        {/* Housing */}
        {homeValueData.some((x) => x.value > 0) && (
          <div>
            <SectionTitle>Home Values</SectionTitle>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={homeValueData} {...chartProps}>
                <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={yAxisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#27272a" }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="#FBBF24" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Occupancy */}
        {occTotal > 0 && (
          <div>
            <SectionTitle>Housing Occupancy</SectionTitle>
            {occData.map((o) => (
              <HorizBar key={o.name} label={o.name} value={o.value} max={occTotal} color={o.color} />
            ))}
          </div>
        )}

        {/* Commute */}
        {commuteData.some((x) => x.value > 0) && (
          <div>
            <SectionTitle>Commute Time</SectionTitle>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={commuteData} {...chartProps}>
                <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={yAxisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#27272a" }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {commuteData.map((_, i) => (
                    <Cell key={i} fill={["#818CF8", "#A78BFA", "#C4B5FD", "#DDD6FE"][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Attribution */}
        <p className="text-[10px] text-zinc-700 pb-2">Source: American Census Survey 2023</p>
      </div>
    </div>
  );
}
