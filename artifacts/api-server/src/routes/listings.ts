import { Router } from "express";

const router = Router();

const REPLIERS_API_URL = "https://api.repliers.io/listings";
const LISTING_FIELDS = "map";

router.get("/listings", async (req, res) => {
  const {
    locationId,
    pageNum = "1",
    resultsPerPage = "100",
    type,
    minBeds,
    minBaths,
    minPrice,
    maxPrice,
    mapBounds,
  } = req.query as Record<string, string>;

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

  const url = new URL(REPLIERS_API_URL);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("pageNum", pageNum);
  url.searchParams.set("resultsPerPage", resultsPerPage);
  url.searchParams.set("fields", LISTING_FIELDS);
  if (type) url.searchParams.set("type", type);
  if (minBeds) url.searchParams.set("minBeds", minBeds);
  if (minBaths) url.searchParams.set("minBaths", minBaths);
  if (minPrice) url.searchParams.set("minPrice", minPrice);
  if (maxPrice) url.searchParams.set("maxPrice", maxPrice);
  if (mapBounds) url.searchParams.set("map", mapBounds);

  try {
    const response = await fetch(url.toString(), {
      headers: { "repliers-api-key": apiKey, "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      req.log.error({ status: response.status, body: text }, "Repliers listings error");
      res.status(502).json({ error: "Upstream API error" });
      return;
    }

    const data = await response.json() as Record<string, unknown>;
    res.json({
      listings: data["listings"] ?? [],
      numPages: data["numPages"] ?? 1,
      page: data["page"] ?? 1,
      count: data["count"] ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch listings");
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

export default router;
