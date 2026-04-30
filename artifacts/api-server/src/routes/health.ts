import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getRepliersHeaders } from "../lib/repliers-headers";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Temporary: inspect the x-forwarded-for chain and resolved IP
router.get("/debug-ip", (req, res) => {
  const chain = req.headers["x-forwarded-for"] ?? "(none)";
  const resolved = getRepliersHeaders(req)["x-repliers-forwarded-for"];
  res.json({ chain, resolved, socketRemote: req.socket.remoteAddress });
});

export default router;
