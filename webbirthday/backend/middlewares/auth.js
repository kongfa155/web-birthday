import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import { SAFE_USER_FIELDS } from "../utils/auth.js";

export async function authenticate(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") || "");
  if (!match) return res.status(401).json({ message: "Vui lòng đăng nhập.", code: "UNAUTHENTICATED" });
  if (!process.env.JWT_SECRET) return res.status(503).json({ message: "Dịch vụ đăng nhập chưa sẵn sàng." });
  let payload;
  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.", code: "UNAUTHENTICATED" });
  }
  if (!payload || typeof payload !== "object" || !mongoose.isValidObjectId(payload.id)) {
    return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ.", code: "UNAUTHENTICATED" });
  }
  try {
    // Role and status are always loaded from the database, never trusted from a JWT role claim.
    const user = await User.findById(payload.id).select(SAFE_USER_FIELDS);
    if (!user) return res.status(401).json({ message: "Tài khoản không còn tồn tại.", code: "UNAUTHENTICATED" });
    if (user.isActive === false) return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa.", code: "ACCOUNT_DISABLED" });
    req.user = user;
    return next();
  } catch {
    return res.status(503).json({ message: "Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại." });
  }
}
export function requireAdmin(req, res, next) {
  if (req.user?.isAdmin !== true) return res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này." });
  return next();
}
export function validId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "ID không hợp lệ." });
  return next();
}
