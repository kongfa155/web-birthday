export const DESIGN_FORMAT = "dom";
export const DESIGN_SCHEMA_VERSION = 1;
export const MAX_ELEMENTS = 200;

export class DesignValidationError extends Error {}
const fail = (message) => { throw new DesignValidationError(message); };
const number = (value, fallback, min, max, name) => {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < min || resolved > max) fail(`${name} không hợp lệ.`);
  return resolved;
};
const text = (value, fallback, limit, name) => {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== "string" || resolved.length > limit) fail(`${name} không hợp lệ.`);
  return resolved;
};
const choice = (value, fallback, values, name) => {
  const resolved = value === undefined ? fallback : value;
  if (!values.includes(resolved)) fail(`${name} không hợp lệ.`);
  return resolved;
};
const color = (value, fallback) => {
  const resolved = text(value, fallback, 100, "Màu sắc");
  if (!/^(?:#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|transparent|white|black)$/i.test(resolved)) fail("Màu sắc không hợp lệ.");
  return resolved;
};

export function isRasterDataUrl(value) {
  return typeof value === "string" && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function validateImageSource(value) {
  const source = text(value, "", 7 * 1024 * 1024, "Nguồn ảnh");
  if (isRasterDataUrl(source)) return source;
  try {
    const parsed = new URL(source);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return source;
  } catch { /* Invalid URLs are rejected below. */ }
  fail("Ảnh cần URL HTTPS hoặc ảnh PNG, JPEG, WebP, GIF dạng base64.");
}

// Shared by backend validation and browser fixtures. Returns a safe, canonical document.
export function normalizeDomDesign(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.schemaVersion !== DESIGN_SCHEMA_VERSION) fail("Phiên bản thiết kế không được hỗ trợ.");
  if (!Array.isArray(input.elements) || input.elements.length > MAX_ELEMENTS) fail(`Thiết kế tối đa ${MAX_ELEMENTS} phần tử.`);
  const ids = new Set();
  const design = {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    width: number(input.width, 1080, 1, 4096, "Chiều rộng thiệp"),
    height: number(input.height, 1440, 1, 4096, "Chiều cao thiệp"),
    background: color(input.background, "#ffffff"),
    elements: input.elements.map((element) => {
      if (!element || typeof element !== "object" || Array.isArray(element)) fail("Phần tử thiết kế không hợp lệ.");
      const id = text(element.id, "", 200, "Mã phần tử");
      if (!id || ids.has(id)) fail("Mã phần tử phải khác nhau.");
      ids.add(id);
      const type = choice(element.type, "", ["text", "image", "shape"], "Loại phần tử");
      const common = {
        id, type,
        x: number(element.x, 0, -8192, 8192, "Tọa độ X"),
        y: number(element.y, 0, -8192, 8192, "Tọa độ Y"),
        width: number(element.width, 300, 1, 8192, "Chiều rộng phần tử"),
        height: number(element.height, 100, 1, 8192, "Chiều cao phần tử"),
        rotation: number(element.rotation, 0, -36000, 36000, "Góc xoay"),
        opacity: number(element.opacity, 1, 0, 1, "Độ mờ"),
      };
      if (type === "image") return {
        ...common, src: validateImageSource(element.src),
        objectFit: choice(element.objectFit, "cover", ["cover", "contain"], "Cách đặt ảnh"),
        borderRadius: number(element.borderRadius, 0, 0, 4096, "Bo góc"),
      };
      if (type === "shape") return {
        ...common,
        shape: choice(element.shape, "rect", ["rect", "ellipse", "heart", "star", "triangle"], "Hình khối"),
        fill: color(element.fill, "#f9a8d4"), stroke: color(element.stroke, "transparent"),
        strokeWidth: number(element.strokeWidth, 0, 0, 100, "Độ dày viền"),
        borderRadius: number(element.borderRadius, 0, 0, 4096, "Bo góc"),
      };
      const rawWeight = element.fontWeight ?? 400;
      const fontWeight = typeof rawWeight === "string" && /^[1-9]00$/.test(rawWeight) ? Number(rawWeight) : rawWeight;
      if (!["normal", "bold"].includes(fontWeight) && !(typeof fontWeight === "number" && fontWeight >= 100 && fontWeight <= 900)) fail("Độ đậm chữ không hợp lệ.");
      const fontFamily = text(element.fontFamily, "Arial, sans-serif", 200, "Phông chữ");
      if (/[;{}<>]|url\s*\(/i.test(fontFamily)) fail("Phông chữ không hợp lệ.");
      return {
        ...common, text: text(element.text, "", 10000, "Nội dung chữ"), fontFamily, fontWeight,
        fontSize: number(element.fontSize, 36, 8, 512, "Cỡ chữ"),
        fontStyle: choice(element.fontStyle, "normal", ["normal", "italic"], "Kiểu chữ"),
        textDecoration: choice(element.textDecoration, "none", ["none", "underline", "line-through"], "Trang trí chữ"),
        textAlign: choice(element.textAlign, "left", ["left", "center", "right", "justify"], "Căn chữ"),
        color: color(element.color, "#1f2937"),
        lineHeight: number(element.lineHeight, 1.3, 0.5, 5, "Giãn dòng"),
        letterSpacing: number(element.letterSpacing, 0, -100, 500, "Giãn chữ"),
      };
    }),
  };
  return design;
}
