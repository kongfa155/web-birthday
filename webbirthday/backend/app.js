import express from "express";
import cors from "cors";
import cardRoutes from "./routes/cardRoutes.js";
import sharedCardRoutes from "./routes/sharedCardRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import { shareHeaders } from "./controllers/CardShareController.js";
import { googleOrigins } from "./utils/googleNonce.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // Google nonce uses a browser cookie. Credentialed CORS must use explicit origins.
  app.use(cors({ origin: (origin, done) => done(null, !origin || googleOrigins().includes(origin)), credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  app.get("/", (req, res) => res.send("Backend is running 🚀"));
  app.use("/api/cards", cardRoutes);
  app.use("/api/shared-cards", sharedCardRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/upload-base64", uploadRoutes);
  app.use((req, res) => res.status(404).json({ message: "Không tìm thấy API." }));
  // Do not expose parser errors, internal paths, database errors or stack traces.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (req.path.startsWith("/api/shared-cards") || /^\/api\/cards\/[^/]+\/share(?:\/|$)/.test(req.path)) {
      shareHeaders(req, res, () => {});
    }
    const status = error.type === "entity.too.large" ? 413 : error.type === "entity.parse.failed" ? 400 : 500;
    return res.status(status).json({ message: status === 413 ? "Dữ liệu gửi lên quá lớn." : status === 400 ? "Dữ liệu JSON không hợp lệ." : "Có lỗi hệ thống. Vui lòng thử lại." });
  });
  return app;
}
