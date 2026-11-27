// Per-process limiter. Use a shared store before deploying multiple server instances.
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const clients = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [key, value] of clients) {
      if (value.expiresAt <= time) clients.delete(key);
    }
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = clients.get(key);
    if (!entry) {
      if (clients.size >= 10000) {
        res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ message: "Hệ thống đang nhận quá nhiều yêu cầu. Vui lòng thử lại sau." });
      }
      entry = { count: 0, expiresAt: time + windowMs };
      clients.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((entry.expiresAt - time) / 1000))));
      return res.status(429).json({ message: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau." });
    }
    return next();
  };
}
