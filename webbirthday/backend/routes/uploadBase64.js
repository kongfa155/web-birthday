import express from "express";
import cloudinary from "../config/cloudinary.js";
import { authenticate } from "../middlewares/auth.js";
import { createRateLimiter } from "../middlewares/rateLimit.js";

const router = express.Router();
router.use(authenticate);
router.use(createRateLimiter({ limit: 30, windowMs: 60 * 1000 }));

router.post("/", async (req, res) => {
  try {
    const { base64 } = req.body;
    if (typeof base64 !== "string" || !/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return res.status(400).json({ message: "Chỉ chấp nhận ảnh PNG, JPEG, WebP hoặc GIF dạng base64." });
    }
    if (Buffer.byteLength(base64.split(",")[1], "base64") > 5 * 1024 * 1024) return res.status(413).json({ message: "Ảnh không được vượt quá 5 MB." });

    const uploadRes = await cloudinary.uploader.upload(base64, {
      folder: "fabric_images",
      resource_type: "image",
    });

    res.json({ url: uploadRes.secure_url });
  } catch (error) {
    console.error("Upload thất bại:", error);
    res.status(500).json({ message: "Upload thất bại" });
  }
});

export default router;
