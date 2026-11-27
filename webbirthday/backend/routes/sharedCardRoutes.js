import express from "express";
import CardShareController, {
  SHARED_CARD_NOT_FOUND_MESSAGE,
  shareHeaders,
} from "../controllers/CardShareController.js";
import { createRateLimiter } from "../middlewares/rateLimit.js";

const router = express.Router();
const sharedCardReadLimiter = createRateLimiter({
  limit: 120,
  windowMs: 60 * 1000,
});

router.use(shareHeaders);
router.use(sharedCardReadLimiter);
router.get("/:token", CardShareController.getSharedCard);
router.use((_req, res) =>
  res.status(404).json({ message: SHARED_CARD_NOT_FOUND_MESSAGE })
);

export default router;
