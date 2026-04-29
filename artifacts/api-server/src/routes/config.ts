import { Router } from "express";

const router = Router();

router.get("/config", (_req, res) => {
  res.json({
    mapboxToken: process.env["MAPBOX_TOKEN"] ?? "",
  });
});

export default router;
