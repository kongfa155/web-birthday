import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const SAFE_USER_FIELDS = "username isAdmin isActive createdAt";
export function safeUser(user) {
  return { _id: user._id, username: user.username, isAdmin: user.isAdmin === true, isActive: user.isActive !== false, createdAt: user.createdAt };
}
export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}
export function validateCredentials(username, password, registration = false) {
  if (!username || username.length > 64) return "Tên đăng nhập phải có từ 1 đến 64 ký tự.";
  if (typeof password !== "string" || !password.length) return "Vui lòng nhập mật khẩu.";
  if (registration && (Array.from(password).length < 6 || Buffer.byteLength(password, "utf8") > 72)) {
    return "Mật khẩu phải có ít nhất 6 ký tự và không quá 72 byte UTF-8.";
  }
  return null;
}
export function createSession(user) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return {
    token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "1d" }),
    user: safeUser(user),
  };
}
export const hashPassword = (password) => bcrypt.hash(password, 10);
