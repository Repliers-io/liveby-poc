import { Router } from "express";
import { GetLocationsQueryParams } from "@workspace/api-zod";

const router = Router();

const REPLIERS_API_URL = "https://api.repliers.io/locations";
const REPLIERS_FIELDS =
  "locationId,name,type,map,address,classification,subType,size,demographics,school";

router.get("/locations", async (req, res) => {
  const parseResult = GetLocationsQueryParams.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { lat, long, type } = parseResult.data;

  const apiKey = process.env["REPLIERS_API_KEY"];
  if (!apiKey) {
    req.log.error("REPLIERS_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  const url = new URL(REPLIERS_API_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("long", String(long));
  url.searchParams.set("source", "LiveBy");
  url.searchParams.set("type", type);
  url.searchParams.set("fields", REPLIERS_FIELDS);

  const clientIp = (req.headers["x-forwarded-for"] as string | undefined)
    ?.split(",")[0]?.trim() || req.ip || "";

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "repliers-api-key": apiKey,
        "Content-Type": "application/json",
        "x-repliers-forwarded-for": clientIp,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      req.log.error(
        { status: response.status, body: text },
        "Repliers API error"
      );
      res.status(502).json({ error: "Upstream API error" });
      return;
    }

    const data = await response.json() as Record<string, unknown>;
    const locations = data["locations"] ?? data ?? [];

    res.json({
      locations,
      count: data["count"] ?? (Array.isArray(locations) ? locations.length : 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch from Repliers API");
    res.status(500).json({ error: "Failed to fetch location data" });
  }
});

export default router;
