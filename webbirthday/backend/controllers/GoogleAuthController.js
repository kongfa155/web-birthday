import { randomUUID } from "node:crypto";
import User from "../models/User.js";
import { createSession } from "../utils/auth.js";
import { hasUniqueGoogleIndex, hasUniqueUsernameIndex } from "../utils/registrationIndex.js";
import { googleVerifier } from "../utils/googleAuth.js";
import { googleNonceStore, readGoogleNonce, setGoogleNonce, clearGoogleNonce, GOOGLE_NONCE_SECONDS } from "../utils/googleNonce.js";

function unavailable(res) {
  return res.status(503).json({ message: "Đăng nhập Google chưa sẵn sàng. Vui lòng thử lại sau." });
}
function session(res, user, created = false) {
  if (user.isActive === false) return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa.", code: "ACCOUNT_DISABLED" });
  return res.status(created ? 201 : 200).json({ message: "Đăng nhập Google thành công.", ...createSession(user) });
}

const GoogleAuthController = {
  challenge: (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.JWT_SECRET) return unavailable(res);
    const nonce = googleNonceStore.issue();
    if (!nonce) return res.status(429).json({ message: "Có quá nhiều phiên đăng nhập Google. Vui lòng thử lại sau." });
    res.set("Cache-Control", "no-store");
    setGoogleNonce(res, nonce);
    return res.json({ nonce, expiresIn: GOOGLE_NONCE_SECONDS });
  },
  login: async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.JWT_SECRET) return unavailable(res);
    const credential = req.body?.credential;
    if (typeof credential !== "string" || !credential || credential.length > 16384) {
      return res.status(400).json({ message: "Thiếu hoặc sai dữ liệu đăng nhập Google." });
    }
    const nonce = readGoogleNonce(req);
    if (!nonce) return res.status(401).json({ message: "Phiên đăng nhập Google không hợp lệ. Vui lòng chọn lại Google." });

    let identity;
    try {
      identity = await googleVerifier.verify(credential);
    } catch (error) {
      // Certificate/network failures are service failures; never log credentials or upstream error bodies.
      const networkFailure = error.code || error.response?.status >= 500;
      if (networkFailure) return unavailable(res);
      return res.status(401).json({ message: "Không thể xác minh tài khoản Google. Vui lòng thử lại." });
    }
    if (!googleNonceStore.consume(nonce, identity.nonce)) {
      return res.status(401).json({ message: "Phiên Google đã hết hạn hoặc được sử dụng. Vui lòng chọn lại Google." });
    }
    clearGoogleNonce(res);
    try {
      if (!await hasUniqueGoogleIndex() || !await hasUniqueUsernameIndex()) return unavailable(res);
      // Only verified Google subject is an identity key. Never search by email or legacy username.
      const existing = await User.findOne({ googleSub: identity.sub }).collation({ locale: "simple" });
      if (existing) return session(res, existing);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const user = new User({
            username: `google_${randomUUID().replaceAll("-", "")}`,
            googleSub: identity.sub,
            ...(identity.email_verified === true && typeof identity.email === "string" && identity.email.length <= 320 ? { email: identity.email } : {}),
            isAdmin: false,
            isActive: true,
          });
          await user.save();
          return session(res, user, true);
        } catch (error) {
          if (error.code !== 11000) throw error;
          const winner = await User.findOne({ googleSub: identity.sub }).collation({ locale: "simple" });
          if (winner) return session(res, winner);
          // A username collision can be retried; never merge with that username's account.
          if (!error.keyPattern?.username) throw error;
        }
      }
      return unavailable(res);
    } catch {
      return unavailable(res);
    }
  },
};
export default GoogleAuthController;
