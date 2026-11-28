import express from "express";
import UserController from "../controllers/UserController.js";
import { authenticate, requireAdmin, validId } from "../middlewares/auth.js";
import { createRateLimiter } from "../middlewares/rateLimit.js";
import GoogleAuthController from "../controllers/GoogleAuthController.js";
import { requireGoogleOrigin } from "../utils/googleNonce.js";

const router = express.Router();

router.post("/register", createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 }), UserController.register);
router.post("/login", createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 }), UserController.login);
router.post("/google/challenge", requireGoogleOrigin, createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 }), GoogleAuthController.challenge);
router.post("/google", requireGoogleOrigin, createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 }), GoogleAuthController.login);
router.use(authenticate);
router.get("/me", UserController.me);
router.use(requireAdmin);
router.post("/", UserController.createUser);
router.get("/", UserController.getAllUsers);
router.get("/stats", UserController.getStats);
router.get("/:id", validId, UserController.getUserById);
router.put("/:id", validId, UserController.update);

export default router;
