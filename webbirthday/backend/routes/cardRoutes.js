import express from "express";
import CardController from "../controllers/CardController.js";
import { authenticate, validId } from "../middlewares/auth.js";

const router = express.Router();
router.use(authenticate);

router.get("/", CardController.getAll); // lấy tất cả card
router.get("/:id", validId, CardController.getById);
router.post("/", CardController.create);
router.put("/:id", validId, CardController.update);
router.delete("/:id", validId, CardController.remove);

export default router;
