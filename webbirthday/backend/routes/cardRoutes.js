import express from "express";
import CardController from "../controllers/CardController.js";
import CardShareController, { shareHeaders } from "../controllers/CardShareController.js";
import { authenticate, validId } from "../middlewares/auth.js";

const router = express.Router();
router.use("/:id/share", shareHeaders);
router.use(authenticate);

router.get("/", CardController.getAll); // lấy tất cả card
router.get("/:id/share", validId, CardShareController.getShareStatus);
router.post("/:id/share", validId, CardShareController.createOrRotateShare);
router.delete("/:id/share", validId, CardShareController.disableShare);
router.get("/:id", validId, CardController.getById);
router.post("/", CardController.create);
router.put("/:id", validId, CardController.update);
router.delete("/:id", validId, CardController.remove);

export default router;
