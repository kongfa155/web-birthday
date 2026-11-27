import express from "express";
import CardController from "../controllers/CardController.js";
import { authenticate, requireAdmin, validId } from "../middlewares/auth.js";

const router = express.Router();
router.use(authenticate);

router.get("/", CardController.getAll); // lấy tất cả card
router.get("/:id", validId, CardController.getById);
// User card creation/sharing is a separate maintenance item after TU-01.
router.post("/", requireAdmin, CardController.create);
router.put("/:id", requireAdmin, validId, CardController.update);

export default router;
