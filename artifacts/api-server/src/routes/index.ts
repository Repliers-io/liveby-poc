import { Router, type IRouter } from "express";
import healthRouter from "./health";
import locationsRouter from "./locations";
import configRouter from "./config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(locationsRouter);
router.use(configRouter);

export default router;
