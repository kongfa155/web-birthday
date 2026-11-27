const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function getApiBase() {
  const raw = import.meta.env.VITE_API_URL;
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/\/+$/, "");
}

export function isValidShareToken(token) {
  return typeof token === "string" && SHARE_TOKEN_PATTERN.test(token);
}

export async function getSharedCard(token, signal) {
  if (!isValidShareToken(token)) {
    const error = new Error("Liên kết chia sẻ không tồn tại hoặc đã bị thu hồi.");
    error.status = 404;
    throw error;
  }

  const base = getApiBase();
  const response = await fetch(
    `${base}/api/shared-cards/${encodeURIComponent(token)}`,
    {
      method: "GET",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      credentials: "omit",
      headers: {
        Accept: "application/json",
      },
      signal,
    }
  );

  if (!response.ok) {
    const message =
      response.status === 429
        ? "Bạn đang truy cập quá nhanh. Vui lòng thử lại sau."
        : response.status === 404
          ? "Liên kết chia sẻ không tồn tại hoặc đã bị thu hồi."
          : "Không thể tải thiệp được chia sẻ. Vui lòng thử lại.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export { fetchDesignJson as fetchSharedDesignJson } from "./designService.js";
