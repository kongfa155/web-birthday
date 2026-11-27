import express from "express";
import UploadController from "../controllers/UploadController.js";
import { authenticate } from "../middlewares/auth.js";
import { createRateLimiter } from "../middlewares/rateLimit.js";

const router = express.Router();
router.use(authenticate);
router.use(createRateLimiter({ limit: 30, windowMs: 60 * 1000 }));

router.post("/", UploadController.uploadBase64);

export default router;
