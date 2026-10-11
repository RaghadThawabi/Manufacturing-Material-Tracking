import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import manufacturingRouter from "./manufacturing";
import detectiveRouter from "./detective";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(detectiveRouter);
router.use(manufacturingRouter);

export default router;
