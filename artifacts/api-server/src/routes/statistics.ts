import { Router } from "express";

const router = Router();

const REPLIERS_API_URL = "https://api.repliers.io/listings";

type MonthEntry = {
  month: string;
  medSoldPrice: number | null;
  avgDaysOnMarket: number | null;
  cntClosed: number | null;
};

router.get("/statistics", async (req, res) => {
  const { locationId } = req.query as Record<string, string>;

  if (!locationId) {
    res.status(400).json({ error: "locationId is required" });
    return;
  }

  const apiKey = process.env["REPLIERS_API_KEY"];
  if (!apiKey) {
    req.log.error("REPLIERS_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  const since = new Date();
  since.setFullYear(since.getFullYear() - 2);
  const minSoldDate = since.toISOString().slice(0, 10);

  const url = new URL(REPLIERS_API_URL);
  url.searchParams.set("listings", "false");
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("status", "U");
  url.searchParams.append("lastStatus", "Sld");
  url.searchParams.append("lastStatus", "Lsd");
  url.searchParams.set("type", "sale");
  url.searchParams.set("statistics", "avg-daysOnMarket,cnt-closed,med-soldPrice,grp-mth");
  url.searchParams.set("minSoldDate", minSoldDate);

  try {
    const response = await fetch(url.toString(), {
      headers: { "repliers-api-key": apiKey, "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      req.log.error({ status: response.status, body: text }, "Repliers statistics error");
      res.status(502).json({ error: "Upstream API error" });
      return;
    }

    const data = await response.json() as Record<string, unknown>;

    // Actual Repliers format:
    //   statistics.soldPrice.mth[month] = { med: number, count: number }
    //   statistics.daysOnMarket.mth[month] = { avg: number, count: number }
    //   statistics.closed.mth[month] = { count: number }
    type MthMap = Record<string, Record<string, number>>;
    const stats = (data["statistics"] ?? {}) as Record<string, { mth?: MthMap; avg?: number; med?: number; count?: number }>;

    const priceMth: MthMap = stats["soldPrice"]?.mth ?? {};
    const domMth: MthMap = stats["daysOnMarket"]?.mth ?? {};
    const closedMth: MthMap = stats["closed"]?.mth ?? {};

    // Union all month keys across the three metrics
    const allMonths = Array.from(new Set([
      ...Object.keys(priceMth),
      ...Object.keys(domMth),
      ...Object.keys(closedMth),
    ])).sort();

    const months: MonthEntry[] = allMonths.map((month) => ({
      month,
      medSoldPrice: (priceMth[month]?.["med"] ?? null) as number | null,
      avgDaysOnMarket: (domMth[month]?.["avg"] ?? null) as number | null,
      cntClosed: (closedMth[month]?.["count"] ?? priceMth[month]?.["count"] ?? null) as number | null,
    }));

    res.json({ months });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch statistics from Repliers");
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

export default router;
