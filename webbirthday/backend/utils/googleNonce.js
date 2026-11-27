import { randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_NONCE_COOKIE = "tu02_google_nonce";
export const GOOGLE_NONCE_SECONDS = 300;
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/users/google",
});

export function googleOrigins() {
  return (process.env.GOOGLE_AUTH_ORIGINS || "http://localhost:5173,http://localhost,http://127.0.0.1:5173").split(",").map((origin) => origin.trim()).filter(Boolean);
}
export function requireGoogleOrigin(req, res, next) {
  if (!googleOrigins().includes(req.get("origin"))) {
    return res.status(403).json({ message: "Nguồn yêu cầu đăng nhập Google không được phép." });
  }
  return next();
}

export function createGoogleNonceStore({ now = Date.now } = {}) {
  const entries = new Map();
  const prune = () => {
    for (const [key, expires] of entries) if (expires <= now()) entries.delete(key);
  };
  return {
    issue() {
      prune();
      if (entries.size >= 10000) return null;
      const nonce = randomBytes(32).toString("base64url");
      entries.set(nonce, now() + GOOGLE_NONCE_SECONDS * 1000);
      return nonce;
    },
    consume(cookie, claimedNonce) {
      prune();
      if (typeof cookie !== "string" || typeof claimedNonce !== "string" || !entries.has(cookie)) return false;
      const expected = Buffer.from(cookie);
      const supplied = Buffer.from(claimedNonce);
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
      entries.delete(cookie);
      return true;
    },
  };
}
export const googleNonceStore = createGoogleNonceStore();
export function readGoogleNonce(req) {
  return /(?:^|;\s*)tu02_google_nonce=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.get("cookie") || "")?.[1];
}
export function setGoogleNonce(res, nonce) {
  res.cookie(GOOGLE_NONCE_COOKIE, nonce, { ...cookieOptions(), maxAge: GOOGLE_NONCE_SECONDS * 1000 });
}
export function clearGoogleNonce(res) {
  res.clearCookie(GOOGLE_NONCE_COOKIE, cookieOptions());
}
