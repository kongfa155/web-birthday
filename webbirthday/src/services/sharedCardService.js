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

function validateDesign(design) {
  if (!design || typeof design !== "object" || !Array.isArray(design.objects)) {
    throw new Error("Dữ liệu thiết kế không hợp lệ.");
  }
  return design;
}

export async function fetchSharedDesignJson(fabricEdit, signal) {
  if (fabricEdit == null || fabricEdit === "") {
    return null;
  }

  if (typeof fabricEdit === "object") {
    return validateDesign(fabricEdit);
  }

  if (typeof fabricEdit !== "string") {
    throw new Error("Dữ liệu thiết kế không hợp lệ.");
  }

  const trimmed = fabricEdit.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed, {
      method: "GET",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      credentials: "omit",
      headers: {
        Accept: "application/json",
      },
      signal,
    });
    if (!response.ok) {
      throw new Error("Không thể tải dữ liệu thiết kế của thiệp.");
    }
    return validateDesign(await response.json());
  }

  if (trimmed.startsWith("{")) {
    return validateDesign(JSON.parse(trimmed));
  }

  throw new Error("Định dạng thiết kế không hợp lệ.");
}
