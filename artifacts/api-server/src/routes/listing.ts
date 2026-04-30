import { Router } from "express";

const router = Router();

const REPLIERS_API_URL = "https://api.repliers.io/listings";

router.get("/listing/:mlsNumber", async (req, res) => {
  const { mlsNumber } = req.params;
  const { boardId } = req.query as Record<string, string>;

  const apiKey = process.env["REPLIERS_API_KEY"];
  if (!apiKey) {
    req.log.error("REPLIERS_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  const url = new URL(`${REPLIERS_API_URL}/${encodeURIComponent(mlsNumber)}`);
  if (boardId) url.searchParams.set("boardId", boardId);

  try {
    const response = await fetch(url.toString(), {
      headers: { "repliers-api-key": apiKey, "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      req.log.error({ status: response.status, body: text }, "Repliers listing detail error");
      res.status(response.status === 404 ? 404 : 502).json({ error: "Upstream API error" });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch listing detail");
    res.status(500).json({ error: "Failed to fetch listing detail" });
  }
});

export default router;
