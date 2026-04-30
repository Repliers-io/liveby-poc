import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell, ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  X, Users, DollarSign, Home, Clock, BookOpen, Phone,
  Globe, Star, TrendingUp, TrendingDown, Minus, BarChart2,
} from "lucide-react";
import { type Demographics } from "./DemographicsDrawer";
import { type SchoolData } from "./SchoolDrawer";

type LayerType = "area" | "city" | "neighborhood" | "school" | null;

type MonthData = {
  month: string;
  medSoldPrice: number | null;
  avgDaysOnMarket: number | null;
  cntClosed: number | null;
};

type StatisticsResponse = { months: MonthData[] };

async function fetchStatistics(locationId: string, type?: string | null): Promise<StatisticsResponse> {
  const params = new URLSearchParams({ locationId });
  if (type) params.set("type", type);
  const res = await fetch(`/api/statistics?${params.toString()}`);
  if (!res.ok) throw new Error(`Statistics fetch failed: ${res.status}`);
  return res.json();
}

type Props = {
  open: boolean;
  name: string;
  locationId: string;
  listingType?: string | null;
  layerLabel: string;
  layerColor: string;
  activeLayer: LayerType;
  demographics: Demographics;
  school: SchoolData | null;
  onClose: () => void;
};

type TabId = "demographics" | "school" | "stats";

// ─── Shared primitives ────────────────────────────────────────────────────────

const CHART_BLUE = "#818CF8";
const GREEN = "#34D399";
const AMBER = "#FBBF24";
const PURPLE = "#8B5CF6";
const SUBTEXT = "#71717a";

function fmt(n: number | null | undefined, prefix = "", decimals = 0): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(decimals === 0 ? 0 : decimals)}K`;
  return `${prefix}${n.toLocaleString()}`;
}

function fmtMonth(m: string): string {
  const [year, mon] = m.split("-");
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${labels[parseInt(mon) - 1]} '${year.slice(2)}`;
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-zinc-100 text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px]">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">{children}</h3>;
}

const ChartTooltip = ({ active, payload, label, prefix = "", suffix = "" }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const formatted = prefix + (val >= 1000 ? fmt(val) : Number(val).toLocaleString()) + suffix;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 shadow-lg">
      <div className="font-medium text-zinc-400">{label}</div>
      <div className="font-bold" style={{ color: payload[0].color ?? CHART_BLUE }}>{formatted}</div>
    </div>
  );
};

function HorizBar({ label, value, max, color = CHART_BLUE }: { label: string; value: number; max: number; color?: string }) {
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

function HorizBarPct({ label, value, max = 100, color = CHART_BLUE }: { label: string; value: number; max?: number; color?: string }) {
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
        <Star key={s} className="w-3.5 h-3.5"
          fill={s <= stars ? AMBER : "transparent"}
          stroke={s <= stars ? AMBER : SUBTEXT} />
      ))}
      <span className="text-[10px] text-zinc-500 ml-1">{stars}/5</span>
    </div>
  );
}

const axisStyle = { fontSize: 10, fill: SUBTEXT };
const chartMargin = { top: 4, right: 4, left: -20, bottom: 0 };

// ─── YoY change helpers ───────────────────────────────────────────────────────

function yoyPct(months: MonthData[], key: "medSoldPrice" | "avgDaysOnMarket" | "cntClosed"): number | null {
  if (months.length < 13) return null;
  const latest = months[months.length - 1][key];
  const yearAgo = months[months.length - 13][key];
  if (latest == null || yearAgo == null || yearAgo === 0) return null;
  return ((latest - yearAgo) / yearAgo) * 100;
}

function momPct(months: MonthData[], key: "medSoldPrice" | "avgDaysOnMarket" | "cntClosed"): number | null {
  if (months.length < 2) return null;
  const cur = months[months.length - 1][key];
  const prev = months[months.length - 2][key];
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function DeltaBadge({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct == null) return <span className="text-zinc-600 text-[11px]">No prior data</span>;
  const isGood = inverse ? pct < 0 : pct > 0;
  const color = pct === 0 ? "text-zinc-500" : isGood ? "text-emerald-400" : "text-red-400";
  const Icon = pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 ${color} text-[11px] font-medium`}>
      <Icon className="w-3 h-3" />
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}% YoY
    </span>
  );
}

// ─── Market Stats Tab ─────────────────────────────────────────────────────────

function MarketStatsTab({ locationId, listingType }: { locationId: string; listingType?: string | null }) {
  const { data, isLoading, isError } = useQuery<StatisticsResponse>({
    queryKey: ["statistics", locationId, listingType ?? "sale"],
    queryFn: () => fetchStatistics(locationId, listingType),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
        Loading market data…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
        Market data unavailable.
      </div>
    );
  }

  const months = data.months.filter((m) => m.medSoldPrice != null || m.cntClosed != null);

  if (months.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
        No closed sales data for this area.
      </div>
    );
  }

  const latest = months[months.length - 1];
  const priceYoY = yoyPct(months, "medSoldPrice");
  const domYoY = yoyPct(months, "avgDaysOnMarket");
  const volYoY = yoyPct(months, "cntClosed");
  const priceMoM = momPct(months, "medSoldPrice");

  const avg6Price = avg(months.slice(-6).map((m) => m.medSoldPrice));
  const avg6Dom = avg(months.slice(-6).map((m) => m.avgDaysOnMarket));

  // Chart datasets with readable labels
  const chartData = months.map((m) => ({
    label: fmtMonth(m.month),
    price: m.medSoldPrice,
    dom: m.avgDaysOnMarket,
    closed: m.cntClosed,
  }));

  // Year-over-year comparison table (current year vs prior year)
  const curYear = latest.month.slice(0, 4);
  const prevYear = String(parseInt(curYear) - 1);
  const curYearMonths = months.filter((m) => m.month.startsWith(curYear));
  const prevYearMonths = months.filter((m) => m.month.startsWith(prevYear));
  const curAvgPrice = avg(curYearMonths.map((m) => m.medSoldPrice));
  const prevAvgPrice = avg(prevYearMonths.map((m) => m.medSoldPrice));
  const curAvgDom = avg(curYearMonths.map((m) => m.avgDaysOnMarket));
  const prevAvgDom = avg(prevYearMonths.map((m) => m.avgDaysOnMarket));
  const curTotal = curYearMonths.reduce((s, m) => s + (m.cntClosed ?? 0), 0);
  const prevTotal = prevYearMonths.reduce((s, m) => s + (m.cntClosed ?? 0), 0);

  // Reference line at the boundary between years on price chart
  const firstCurYearIdx = chartData.findIndex((d) => months.find((m) => fmtMonth(m.month) === d.label)?.month.startsWith(curYear));

  return (
    <div className="space-y-5">
      {/* Key stat cards */}
      <div>
        <SectionTitle>Latest Month — {fmtMonth(latest.month)}</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={<DollarSign className="w-3 h-3" />}
            label="Median Price"
            value={fmt(latest.medSoldPrice, "$")}
            sub={<DeltaBadge pct={priceYoY} />}
          />
          <StatCard
            icon={<Clock className="w-3 h-3" />}
            label="Avg Days on Mkt"
            value={latest.avgDaysOnMarket != null ? `${Math.round(latest.avgDaysOnMarket)} days` : "—"}
            sub={<DeltaBadge pct={domYoY} inverse />}
          />
          <StatCard
            icon={<Home className="w-3 h-3" />}
            label="Closed Sales"
            value={latest.cntClosed != null ? String(Math.round(latest.cntClosed)) : "—"}
            sub={<DeltaBadge pct={volYoY} />}
          />
          <StatCard
            icon={<TrendingUp className="w-3 h-3" />}
            label="6-Mo Avg Price"
            value={fmt(avg6Price, "$")}
            sub={priceMoM != null ? (
              <span className={`text-[11px] font-medium ${priceMoM >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {priceMoM >= 0 ? "+" : ""}{priceMoM.toFixed(1)}% MoM
              </span>
            ) : undefined}
          />
        </div>
      </div>

      {/* Median sold price trend */}
      <div>
        <SectionTitle>Median Sold Price — 24 Months</SectionTitle>
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={chartData} margin={chartMargin}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="10%" stopColor={GREEN} stopOpacity={0.3} />
                <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={38}
              tickFormatter={(v) => fmt(v, "$")} />
            <Tooltip content={<ChartTooltip prefix="$" />} cursor={{ stroke: "#3f3f46" }} />
            <Area type="monotone" dataKey="price" stroke={GREEN} strokeWidth={2}
              fill="url(#priceGrad)" dot={false} activeDot={{ r: 4, fill: GREEN }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Closed sales volume */}
      <div>
        <SectionTitle>Closed Sales Volume</SectionTitle>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={chartData} margin={chartMargin}>
            <XAxis dataKey="label" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={28}
              tickFormatter={(v) => String(Math.round(v))} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
            <Bar dataKey="closed" radius={[2, 2, 0, 0]} maxBarSize={18}>
              {chartData.map((d, i) => (
                <Cell key={i}
                  fill={months[i]?.month.startsWith(curYear) ? CHART_BLUE : "#3f3f46"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Avg days on market */}
      <div>
        <SectionTitle>Avg Days on Market</SectionTitle>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={chartData} margin={chartMargin}>
            <defs>
              <linearGradient id="domGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="10%" stopColor={AMBER} stopOpacity={0.25} />
                <stop offset="95%" stopColor={AMBER} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={28}
              tickFormatter={(v) => `${Math.round(v)}d`} />
            <Tooltip content={<ChartTooltip suffix=" days" />} cursor={{ stroke: "#3f3f46" }} />
            <Area type="monotone" dataKey="dom" stroke={AMBER} strokeWidth={2}
              fill="url(#domGrad)" dot={false} activeDot={{ r: 4, fill: AMBER }} />
            {avg6Dom != null && (
              <ReferenceLine y={avg6Dom} stroke={AMBER} strokeDasharray="4 2" strokeOpacity={0.5}
                label={{ value: `6mo avg`, position: "right", fill: AMBER, fontSize: 9 }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Year-over-year comparison table */}
      {prevYearMonths.length > 0 && (
        <div>
          <SectionTitle>Year-over-Year Comparison</SectionTitle>
          <div className="bg-zinc-900 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-500 font-semibold">Metric</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-semibold">{prevYear}</th>
                  <th className="text-right px-3 py-2 text-zinc-200 font-semibold">{curYear}</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-800/50">
                  <td className="px-3 py-2 text-zinc-400">Median Price</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{fmt(prevAvgPrice, "$")}</td>
                  <td className="px-3 py-2 text-right text-zinc-200 font-medium">{fmt(curAvgPrice, "$")}</td>
                  <td className="px-3 py-2 text-right">
                    {prevAvgPrice && curAvgPrice ? (
                      <span className={curAvgPrice >= prevAvgPrice ? "text-emerald-400" : "text-red-400"}>
                        {curAvgPrice >= prevAvgPrice ? "+" : ""}
                        {(((curAvgPrice - prevAvgPrice) / prevAvgPrice) * 100).toFixed(1)}%
                      </span>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="px-3 py-2 text-zinc-400">Avg DOM</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{prevAvgDom != null ? `${Math.round(prevAvgDom)}d` : "—"}</td>
                  <td className="px-3 py-2 text-right text-zinc-200 font-medium">{curAvgDom != null ? `${Math.round(curAvgDom)}d` : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {prevAvgDom && curAvgDom ? (
                      <span className={curAvgDom <= prevAvgDom ? "text-emerald-400" : "text-red-400"}>
                        {curAvgDom <= prevAvgDom ? "" : "+"}{(((curAvgDom - prevAvgDom) / prevAvgDom) * 100).toFixed(1)}%
                      </span>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-zinc-400">Closed Sales</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{prevTotal || "—"}</td>
                  <td className="px-3 py-2 text-right text-zinc-200 font-medium">{curTotal || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {prevTotal && curTotal ? (
                      <span className={curTotal >= prevTotal ? "text-emerald-400" : "text-red-400"}>
                        {curTotal >= prevTotal ? "+" : ""}
                        {(((curTotal - prevTotal) / prevTotal) * 100).toFixed(1)}%
                      </span>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[10px] text-zinc-700 pb-2">Source: Repliers — Sold &amp; Leased (past 2 years)</p>
    </div>
  );
}

// ─── Demographics Tab (content from DemographicsDrawer) ───────────────────────

function DemographicsTab({ d }: { d: Demographics }) {
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

  const edu = d.education ?? {};
  const eduTotal =
    (edu.noDegree ?? 0) + (edu.highSchool ?? 0) + (edu.collegeBelowBachelor ?? 0) +
    (edu.bachelor ?? 0) + (edu.master ?? 0) + (edu.doctorate ?? 0);
  const eduItems = [
    { label: "No Degree", value: edu.noDegree ?? 0 },
    { label: "High School", value: edu.highSchool ?? 0 },
    { label: "Some College", value: edu.collegeBelowBachelor ?? 0 },
    { label: "Bachelor's", value: edu.bachelor ?? 0 },
    { label: "Master's", value: edu.master ?? 0 },
    { label: "Doctorate", value: edu.doctorate ?? 0 },
  ];

  const occ = d.occupancy ?? {};
  const occData = [
    { name: "Owner", value: occ.unitOccupiedOwner ?? 0, color: CHART_BLUE },
    { name: "Renter", value: occ.unitOccupiedRenter ?? 0, color: GREEN },
    { name: "Absent Owner", value: occ.absenteeOwner ?? 0, color: AMBER },
    { name: "Vacant", value: occ.vacant ?? 0, color: "#F87171" },
  ].filter((x) => x.value > 0);
  const occTotal = occData.reduce((s, x) => s + x.value, 0);

  const ct = d.commuteTime ?? {};
  const commuteData = [
    { name: "<15 min", value: ct.under15Minutes ?? 0 },
    { name: "15–29 min", value: ct.between15To29Minutes ?? 0 },
    { name: "30–59 min", value: ct.between30To59Minutes ?? 0 },
    { name: "60+ min", value: ct.over60Minutes ?? 0 },
  ];

  const hv = d.homeValue ?? {};
  const homeValueData = [
    { name: "<$100K", value: hv.below100000 ?? 0 },
    { name: "$100–150K", value: hv.between100000To150000 ?? 0 },
    { name: "$150–200K", value: hv.between150000To200000 ?? 0 },
    { name: "$200–300K", value: hv.between200000To300000 ?? 0 },
    { name: "$300–500K", value: hv.between300000To500000 ?? 0 },
    { name: ">$500K", value: hv.above500000 ?? 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Users className="w-3 h-3" />} label="Population" value={fmt(d.population)} />
        <StatCard icon={<Clock className="w-3 h-3" />} label="Median Age"
          value={d.medianAge != null ? `${d.medianAge} yrs` : "—"} />
        <StatCard icon={<DollarSign className="w-3 h-3" />} label="Median Income"
          value={fmt(d.medianIncome, "$")} />
        <StatCard icon={<Home className="w-3 h-3" />} label="Median Home"
          value={fmt(d.medianHouseValue, "$")} />
      </div>

      {ageData.length > 0 && (
        <div>
          <SectionTitle>Age Distribution</SectionTitle>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={ageData} margin={chartMargin}>
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={CHART_BLUE} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {incomeData.length > 0 && (
        <div>
          <SectionTitle>Household Income</SectionTitle>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={incomeData} margin={chartMargin}>
              <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={GREEN} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {eduTotal > 0 && (
        <div>
          <SectionTitle>Education</SectionTitle>
          {eduItems.map((e) => (
            <HorizBar key={e.label} label={e.label} value={e.value} max={eduTotal} color={CHART_BLUE} />
          ))}
        </div>
      )}

      {homeValueData.some((x) => x.value > 0) && (
        <div>
          <SectionTitle>Home Values</SectionTitle>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={homeValueData} margin={chartMargin}>
              <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={AMBER} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {occTotal > 0 && (
        <div>
          <SectionTitle>Housing Occupancy</SectionTitle>
          {occData.map((o) => (
            <HorizBar key={o.name} label={o.name} value={o.value} max={occTotal} color={o.color} />
          ))}
        </div>
      )}

      {commuteData.some((x) => x.value > 0) && (
        <div>
          <SectionTitle>Commute Time</SectionTitle>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={commuteData} margin={chartMargin}>
              <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => fmt(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {commuteData.map((_, i) => (
                  <Cell key={i} fill={["#818CF8","#A78BFA","#C4B5FD","#DDD6FE"][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-[10px] text-zinc-700 pb-2">Source: American Census Survey 2023</p>
    </div>
  );
}

// ─── School Details Tab ────────────────────────────────────────────────────────

function SchoolTab({ school, layerColor }: { school: SchoolData; layerColor: string }) {
  const rankHistory = (school.metrics?.rankHistory ?? [])
    .filter((r) => r.rank > 0 && r.rankOf > 0)
    .sort((a, b) => a.year - b.year);

  const rankChartData = rankHistory.map((r) => ({
    year: String(r.year),
    percentile: Math.round(((r.rankOf - r.rank) / r.rankOf) * 100),
  }));

  const yearlyDetails = (school.metrics?.schoolYearlyDetails ?? []).sort((a, b) => b.year - a.year);
  const latestYear = yearlyDetails[0];
  const latestRank = rankHistory.length > 0 ? rankHistory[rankHistory.length - 1] : undefined;

  const enrollmentData = [...yearlyDetails].reverse()
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

  return (
    <div className="space-y-5">
      {/* Key stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Users className="w-3 h-3" />} label="Students"
          value={latestYear?.numberOfStudents != null ? latestYear.numberOfStudents.toLocaleString() : "—"} />
        <StatCard icon={<BookOpen className="w-3 h-3" />} label="Pupil : Teacher"
          value={latestYear?.pupilTeacherRatio != null ? `${latestYear.pupilTeacherRatio} : 1` : "—"} />
        <StatCard icon={<Star className="w-3 h-3" />} label="State Rank"
          value={latestRank ? `#${latestRank.rank.toLocaleString()} of ${latestRank.rankOf.toLocaleString()}` : "—"} />
        <StatCard icon={<Users className="w-3 h-3" />} label="Free Lunch"
          value={latestYear?.percentFreeDiscLunch != null ? `${latestYear.percentFreeDiscLunch.toFixed(0)}%` : "—"} />
      </div>

      {latestRank && latestRank.rankStars >= 0 && <StarRating stars={latestRank.rankStars} />}

      {/* Contact */}
      <div className="flex items-center gap-3">
        {school.phone && (
          <a href={`tel:${school.phone}`}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
            <Phone className="w-3 h-3" />
            {school.phone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
          </a>
        )}
        {school.website && (
          <a href={school.website.startsWith("http") ? school.website : `https://${school.website}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
            <Globe className="w-3 h-3" />Website
          </a>
        )}
      </div>

      {rankChartData.length > 1 && (
        <div>
          <SectionTitle>State Rank Percentile (higher = better)</SectionTitle>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={rankChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="year" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={35} domain={[0, 100]}
                tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTooltip suffix="th %ile" />} cursor={{ stroke: "#3f3f46" }} />
              <Line type="monotone" dataKey="percentile" stroke={PURPLE} strokeWidth={2}
                dot={{ fill: PURPLE, r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {enrollmentData.length > 1 && (
        <div>
          <SectionTitle>Student Enrollment</SectionTitle>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={enrollmentData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="year" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={35}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
              <Bar dataKey="students" radius={[3, 3, 0, 0]} fill={GREEN} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {diversityItems.length > 0 && (
        <div>
          <SectionTitle>Student Diversity ({latestYear?.year})</SectionTitle>
          {diversityItems.map((item) => (
            <HorizBarPct key={item.label} label={item.label} value={item.value} max={100} color={item.color} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-700 pb-2">Source: Repliers School Data</p>
    </div>
  );
}

// ─── Main LocationDrawer ───────────────────────────────────────────────────────

export default function LocationDrawer({
  open, name, locationId, listingType, layerLabel, layerColor, activeLayer,
  demographics, school, onClose,
}: Props) {
  const showSchoolTab = activeLayer === "school" && school != null;

  const defaultTab: TabId = showSchoolTab ? "school" : "demographics";
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  // Reset tab when location or layer changes
  useEffect(() => {
    setActiveTab(showSchoolTab ? "school" : "demographics");
  }, [locationId, activeLayer]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "demographics", label: "Demographics" },
    ...(showSchoolTab ? [{ id: "school" as TabId, label: "School Details" }] : []),
    { id: "stats", label: "Market Stats" },
  ];

  const gradeLevel = showSchoolTab && school
    ? (school.metrics?.rankHistory?.slice(-1)[0]?.rankLevel ?? "")
    : "";

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
      <div className="flex-shrink-0 px-4 pt-4 pb-0 border-b border-zinc-800">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1"
              style={{ backgroundColor: layerColor + "22", color: layerColor }}
            >
              {showSchoolTab && gradeLevel ? `${gradeLevel} School` : layerLabel}
            </div>
            <h2 className="text-base font-bold text-zinc-100 leading-snug">
              {showSchoolTab ? (school?.schoolName || name) : name}
            </h2>
            {showSchoolTab && school?.districtName && (
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

        {/* Tab bar */}
        <div className="flex gap-0 -mx-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                "flex-1 px-2 py-2 text-[11px] font-semibold border-b-2 transition-colors " +
                (activeTab === tab.id
                  ? "border-indigo-500 text-indigo-300"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "demographics" && <DemographicsTab d={demographics} />}
        {activeTab === "school" && showSchoolTab && <SchoolTab school={school!} layerColor={layerColor} />}
        {activeTab === "stats" && <MarketStatsTab locationId={locationId} listingType={listingType} />}
      </div>
    </div>
  );
}
