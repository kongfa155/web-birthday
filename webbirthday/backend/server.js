import mongoose from "mongoose";
import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();
if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
  console.error("Thiếu cấu hình MONGO_URI hoặc JWT_SECRET.");
  process.exitCode = 1;
} else {
  try {
    // Never create collections/indexes implicitly. Schema changes require separate approval.
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
    const port = process.env.PORT || 5000;
    createApp().listen(port, () => console.log(`Server running on port ${port}`));
  } catch {
    console.error("Không thể kết nối MongoDB. Kiểm tra cấu hình và quyền truy cập.");
    process.exitCode = 1;
  }
}
