import { validateDomDesign } from "../utils/domDesign.js";

/**
 * Shared helpers for loading and validating native DOM and legacy Fabric designs.
 */

export function isDomDesign(design) {
  try {
    validateDomDesign(design);
    return true;
  } catch {
    return false;
  }
}

export function isLegacyFabricDesign(design) {
  return Boolean(
    design &&
      typeof design === "object" &&
      !Array.isArray(design) &&
      Array.isArray(design.objects)
  );
}

function validateDesignPayload(design) {
  if (isDomDesign(design)) {
    return validateDomDesign(design);
  }
  if (isLegacyFabricDesign(design)) {
    return design;
  }
  throw new Error(
    "Dữ liệu thiết kế không đúng định dạng DOM hoặc Fabric hợp lệ."
  );
}

function isFetchableUrl(value) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

/**
 * Fetches or parses a design JSON from a URL, JSON string, or plain object.
 * Never attaches Authorization headers, cookies, or referrer when fetching external design URLs.
 */
export async function fetchDesignJson(source, signal) {
  if (source == null || source === "") {
    return null;
  }

  if (typeof source === "object") {
    return validateDesignPayload(source);
  }

  if (typeof source !== "string") {
    throw new Error("Dữ liệu thiết kế không hợp lệ.");
  }

  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  if (isFetchableUrl(trimmed)) {
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
      const error = new Error(
        `Không thể tải dữ liệu thiết kế (mã lỗi ${response.status}).`
      );
      error.status = response.status;
      throw error;
    }

    const parsed = await response.json();
    return validateDesignPayload(parsed);
  }

  if (trimmed.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Không thể phân tích chuỗi JSON của thiết kế.");
    }
    return validateDesignPayload(parsed);
  }

  throw new Error("Định dạng nguồn thiết kế không hợp lệ.");
}

/**
 * Classifies a backend card/template record into 'dom', 'legacy-fabric', 'empty', or 'unsupported'.
 * A record declaring designFormat: 'dom' with an existing designUrl/design will never fall back to empty on corruption.
 */
export function classifyRecordDesign(record) {
  if (!record || typeof record !== "object") {
    return { kind: "empty", source: null };
  }

  const rawSource = record.designUrl || record.design || null;
  const hasDomSource = Boolean(rawSource);
  const hasLegacyFabric = Boolean(record.fabricEdit);

  if (record.designFormat === "fabric") {
    return {
      kind: "legacy-fabric",
      source: record.fabricEdit || null,
    };
  }

  if (record.designFormat === "dom") {
    if (!hasDomSource) {
      return { kind: "unsupported", source: null };
    }
    return {
      kind: "dom",
      source: rawSource,
    };
  }

  if (typeof record.designFormat === "string" && record.designFormat.trim()) {
    return {
      kind: "unsupported",
      source: rawSource || record.fabricEdit || null,
    };
  }

  if (hasDomSource) {
    if (typeof rawSource === "object" && !isDomDesign(rawSource)) {
      return {
        kind: "unsupported",
        source: rawSource,
      };
    }
    return {
      kind: "dom",
      source: rawSource,
    };
  }

  if (hasLegacyFabric) {
    return {
      kind: "legacy-fabric",
      source: record.fabricEdit,
    };
  }

  return { kind: "empty", source: null };
}
