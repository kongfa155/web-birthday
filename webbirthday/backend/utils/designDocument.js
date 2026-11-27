import { randomUUID } from "node:crypto";
import { normalizeDomDesign, DesignValidationError, isRasterDataUrl } from "../../shared/designSchema.js";
import cloudinary from "../config/cloudinary.js";

export class DesignInputError extends Error {}

function validateImage(value) {
  if (!isRasterDataUrl(value)) throw new DesignInputError("Ảnh cần định dạng PNG, JPEG, WebP hoặc GIF.");
  if (Buffer.byteLength(value.split(",")[1], "base64") > 5 * 1024 * 1024) throw new DesignInputError("Ảnh không được vượt quá 5 MB.");
}

export function parseDomDesign(value) {
  try {
    const parsed = normalizeDomDesign(typeof value === "string" ? JSON.parse(value) : value);
    for (const element of parsed.elements) {
      if (element.type === "image" && element.src.startsWith("data:")) validateImage(element.src);
    }
    return parsed;
  } catch (error) {
    if (error instanceof DesignInputError) throw error;
    throw new DesignInputError(error instanceof DesignValidationError ? error.message : "Dữ liệu thiết kế không hợp lệ.");
  }
}

export function validateDesignRequest(body) {
  if (body.designUrl !== undefined || body.designFormat !== undefined || body.previewUrl !== undefined) {
    throw new DesignInputError("Hãy gửi nội dung thiết kế, không gửi URL lưu trữ trực tiếp.");
  }
  if (body.design !== undefined && body.fabricEdit !== undefined) throw new DesignInputError("Chỉ gửi một định dạng thiết kế.");
  if (body.preview !== undefined && body.design === undefined) throw new DesignInputError("Ảnh xem trước cần đi kèm thiết kế.");
  if (body.design === undefined) return null;
  const design = parseDomDesign(body.design);
  validateImage(body.preview);
  return design;
}

// Only embedded raster images are uploaded; external URLs are never fetched by the server.
export async function saveDomDesign(design, preview) {
  const images = new Set();
  const uploaded = new Map();
  for (const element of design.elements) {
    if (element.type !== "image") continue;
    const value = element.src;
    if (value.startsWith("data:")) {
      if (!uploaded.has(value)) {
        const result = await cloudinary.uploader.upload(value, { folder: "birthday_assets", resource_type: "image" });
        uploaded.set(value, result.secure_url);
      }
      element.src = uploaded.get(value);
    }
    images.add(element.src);
  }
  const thumbnail = await cloudinary.uploader.upload(preview, { folder: "birthday_previews", resource_type: "image" });
  const designUrl = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: "raw", folder: "birthday_designs", public_id: randomUUID(), overwrite: false,
    }, (error, result) => error ? reject(error) : resolve(result.secure_url));
    stream.end(Buffer.from(JSON.stringify(design), "utf-8"));
  });
  return { designUrl, designFormat: "dom", previewUrl: thumbnail.secure_url, imgURL: [...images] };
}
