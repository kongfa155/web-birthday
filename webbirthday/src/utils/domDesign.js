import { toPng } from "html-to-image";
import { normalizeDomDesign as validateDocumentSchema } from "../../shared/designSchema.js";
import { uploadBase64Image } from "../services/uploadServices.js";

export const DOM_SCHEMA_VERSION = 1;
export const MAX_DESIGN_ELEMENTS = 200;
export const MIN_DOC_DIMENSION = 1;
export const MAX_DOC_DIMENSION = 4096;
export const MIN_ELEMENT_DIMENSION = 1;
export const MAX_ELEMENT_DIMENSION = 8192;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 512;

export const VALID_ELEMENT_TYPES = new Set(["text", "image", "shape"]);
export const VALID_SHAPES = new Set([
  "rect",
  "ellipse",
  "heart",
  "star",
  "triangle",
]);
export const VALID_OBJECT_FITS = new Set(["cover", "contain"]);
export const VALID_FONT_STYLES = new Set(["normal", "italic"]);
export const VALID_TEXT_DECORATIONS = new Set([
  "none",
  "underline",
  "line-through",
]);
export const VALID_TEXT_ALIGNS = new Set(["left", "center", "right"]);

export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export const ALLOWED_IMAGE_EXTENSIONS = ".png,.jpg,.jpeg,.webp,.gif";

export const SYSTEM_FONT_OPTIONS = [
  {
    id: "sans",
    label: "Sans Hiện Đại",
    value:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: "serif",
    label: "Serif Cổ Điển",
    value: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "script",
    label: "Viết Tay",
    value: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  },
  {
    id: "clean",
    label: "Thanh Lịch",
    value: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
  },
  {
    id: "mono",
    label: "Máy Chữ",
    value: '"Courier New", Courier, monospace',
  },
];

let uidCounter = 0;

export function nextElementId(prefix = "el") {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

export function validateDomDesign(doc) {
  return validateDocumentSchema(doc);
}

function roundNumber(value, decimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeElement(el) {
  const common = {
    id: typeof el.id === "string" && el.id.trim() ? el.id.trim() : nextElementId(el.type || "el"),
    type: el.type,
    x: roundNumber(el.x ?? 0),
    y: roundNumber(el.y ?? 0),
    width: clampNumber(roundNumber(el.width ?? 100), MIN_ELEMENT_DIMENSION, MAX_ELEMENT_DIMENSION),
    height: clampNumber(roundNumber(el.height ?? 100), MIN_ELEMENT_DIMENSION, MAX_ELEMENT_DIMENSION),
    rotation: roundNumber(el.rotation ?? 0),
    opacity: clampNumber(roundNumber(el.opacity ?? 1, 3), 0, 1),
  };

  if (el.type === "text") {
    return {
      ...common,
      text: typeof el.text === "string" ? el.text : "",
      fontFamily:
        typeof el.fontFamily === "string" && el.fontFamily.trim()
          ? el.fontFamily
          : SYSTEM_FONT_OPTIONS[0].value,
      fontSize: clampNumber(roundNumber(el.fontSize ?? 32), MIN_FONT_SIZE, MAX_FONT_SIZE),
      fontWeight: el.fontWeight != null ? String(el.fontWeight) : "400",
      fontStyle: VALID_FONT_STYLES.has(el.fontStyle) ? el.fontStyle : "normal",
      textDecoration: VALID_TEXT_DECORATIONS.has(el.textDecoration)
        ? el.textDecoration
        : "none",
      textAlign: VALID_TEXT_ALIGNS.has(el.textAlign) ? el.textAlign : "left",
      color: typeof el.color === "string" && el.color.trim() ? el.color : "#1e293b",
      lineHeight: Math.max(0.5, roundNumber(el.lineHeight ?? 1.35)),
      letterSpacing: roundNumber(el.letterSpacing ?? 0),
    };
  }

  if (el.type === "image") {
    return {
      ...common,
      src: typeof el.src === "string" ? el.src.trim() : "",
      objectFit: VALID_OBJECT_FITS.has(el.objectFit) ? el.objectFit : "cover",
      borderRadius: Math.max(0, roundNumber(el.borderRadius ?? 0)),
    };
  }

  return {
    ...common,
    type: "shape",
    shape: VALID_SHAPES.has(el.shape) ? el.shape : "rect",
    fill: typeof el.fill === "string" && el.fill.trim() ? el.fill : "#fb7185",
    stroke: typeof el.stroke === "string" ? el.stroke : "transparent",
    strokeWidth: Math.max(0, roundNumber(el.strokeWidth ?? 0)),
    borderRadius: Math.max(0, roundNumber(el.borderRadius ?? 0)),
  };
}

export function normalizeDomDesign(doc) {
  const normalized = {
    schemaVersion: DOM_SCHEMA_VERSION,
    width: clampNumber(Math.round(Number(doc?.width) || 1080), MIN_DOC_DIMENSION, MAX_DOC_DIMENSION),
    height: clampNumber(Math.round(Number(doc?.height) || 1440), MIN_DOC_DIMENSION, MAX_DOC_DIMENSION),
    background:
      typeof doc?.background === "string" && doc.background.trim()
        ? doc.background.trim()
        : "#ffffff",
    elements: Array.isArray(doc?.elements) ? doc.elements.map(normalizeElement) : [],
  };
  return validateDomDesign(normalized);
}

export function cloneDomDesign(doc) {
  return JSON.parse(JSON.stringify(doc));
}

export function createDefaultElement(type, overrides = {}) {
  if (type === "text") {
    return normalizeElement({
      id: nextElementId("text"),
      type: "text",
      x: 140,
      y: 220,
      width: 560,
      height: 120,
      rotation: 0,
      opacity: 1,
      text: "Chúc mừng sinh nhật!",
      fontFamily: SYSTEM_FONT_OPTIONS[0].value,
      fontSize: 48,
      fontWeight: "700",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "center",
      color: "#1e293b",
      lineHeight: 1.3,
      letterSpacing: 0,
      ...overrides,
    });
  }

  if (type === "image") {
    return normalizeElement({
      id: nextElementId("image"),
      type: "image",
      x: 240,
      y: 260,
      width: 420,
      height: 420,
      rotation: 0,
      opacity: 1,
      src: "",
      objectFit: "cover",
      borderRadius: 16,
      ...overrides,
    });
  }

  return normalizeElement({
    id: nextElementId("shape"),
    type: "shape",
    x: 340,
    y: 340,
    width: 220,
    height: 220,
    rotation: 0,
    opacity: 1,
    shape: "rect",
    fill: "#fb7185",
    stroke: "#e11d48",
    strokeWidth: 0,
    borderRadius: 16,
    ...overrides,
  });
}

export function validateImageFile(file) {
  if (!file || !(file instanceof Blob)) {
    throw new Error("Vui lòng chọn một tệp hình ảnh hợp lệ.");
  }

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    throw new Error("Chỉ hỗ trợ ảnh định dạng PNG, JPG, WebP hoặc GIF.");
  }

  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    throw new Error("Dung lượng ảnh không được vượt quá 5MB.");
  }
}

export function readImageFileAsDataUrl(file) {
  validateImageFile(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (
        typeof reader.result === "string" &&
        reader.result.startsWith("data:image/")
      ) {
        resolve(reader.result);
      } else {
        reject(new Error("Không thể đọc nội dung tệp ảnh."));
      }
    };
    reader.onerror = () => {
      reject(new Error("Lỗi khi đọc tệp ảnh từ thiết bị."));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Validates (PNG/JPG/WebP/GIF, max 5MB), reads via FileReader, and uploads to /api/upload-base64.
 */
export async function uploadDesignImageFile(file) {
  const base64 = await readImageFileAsDataUrl(file);
  const result = await uploadBase64Image(base64);
  const uploadedUrl =
    typeof result === "string"
      ? result
      : result?.url || result?.secure_url || "";

  if (!uploadedUrl || typeof uploadedUrl !== "string") {
    throw new Error("Máy chủ không trả về đường dẫn ảnh hợp lệ.");
  }

  return uploadedUrl;
}

/**
 * Awaits document.fonts.ready and ensures every <img> inside containerEl has loaded and decoded.
 * Rejects if any image fails to load or decodes with zero naturalWidth.
 */
export async function waitForDocumentAssets(containerEl) {
  if (document.fonts?.ready) await document.fonts.ready;
  if (!containerEl) return;
  await Promise.all(Array.from(containerEl.querySelectorAll("img")).map(async (img) => {
    if (!img.complete) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          img.removeEventListener("load", loaded);
          img.removeEventListener("error", failed);
        };
        const loaded = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Không thể tải hình ảnh trong thiết kế.")); };
        const timer = setTimeout(() => {
          cleanup(); reject(new Error("Hình ảnh tải quá lâu. Vui lòng thử lại."));
        }, 15000);
        img.addEventListener("load", loaded, { once: true });
        img.addEventListener("error", failed, { once: true });
        if (img.complete) loaded();
      });
    }
    if (!img.naturalWidth) throw new Error("Không thể tải hình ảnh trong thiết kế.");
    if (typeof img.decode === "function") {
      try { await img.decode(); }
      catch { throw new Error("Không thể giải mã hình ảnh trong thiết kế."); }
    }
  }));
}

/**
 * Captures the logical design plane DOM element to a PNG data URL at full fixed dimensions,
 * independent of viewport zoom. Capture a snapshot so pending UI changes cannot
 * alter the preview midway through export or make the live workspace jump.
 */
export async function captureDesignPng(
  planeEl,
  { width, height, pixelRatio = 1 } = {}
) {
  if (!planeEl) {
    throw new Error("Không tìm thấy khung thiết kế để xuất ảnh.");
  }

  const snapshot = planeEl.cloneNode(true);
  snapshot.style.transform = "none";
  snapshot.style.transformOrigin = "top left";
  for (const node of snapshot.querySelectorAll("[data-element-id]")) node.style.outline = "none";
  const offscreen = document.createElement("div");
  offscreen.setAttribute("aria-hidden", "true");
  Object.assign(offscreen.style, { position: "fixed", left: "-100000px", top: "0", pointerEvents: "none" });
  offscreen.appendChild(snapshot);
  document.body.appendChild(offscreen);

  try {
    await waitForDocumentAssets(snapshot);
    const dataUrl = await toPng(snapshot, {
      width,
      height,
      pixelRatio,
      skipAutoScale: true,
      cacheBust: false,
      style: {
        transform: "none",
        transformOrigin: "top left",
        margin: "0",
      },
      fetchRequestInit: {
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    });

    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) {
      throw new Error("Dữ liệu ảnh PNG xuất ra không hợp lệ.");
    }

    return dataUrl;
  } finally {
    offscreen.remove();
  }
}
