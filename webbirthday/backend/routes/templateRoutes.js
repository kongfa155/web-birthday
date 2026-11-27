import express from "express";
import TemplateController from "../controllers/TemplateController.js";
import { authenticate, requireAdmin, validId } from "../middlewares/auth.js";

const router = express.Router();
router.use(authenticate);

router.post("/", requireAdmin, TemplateController.create);
router.get("/", TemplateController.getAll);
router.get("/:id", validId, TemplateController.getById);
router.put("/:id", requireAdmin, validId, TemplateController.update);

export default router;
