// backend/utils/processFabricEdit.js
import { uploadImage } from "../services/cloudinaryService.js";

export const processFabricEditImages = async (fabricEdit) => {
  if (!fabricEdit || !fabricEdit.objects) return { fabricEdit, imgURLs: [] };

  const imgURLs = [];

  async function visit(obj) {
    if (!obj || typeof obj !== "object") return;
    if (String(obj.type).toLowerCase() === "image" && typeof obj.src === "string" && obj.src) {
      const src = obj.src;
      // Nếu là ảnh base64, upload lên Cloudinary
      if (src.startsWith("data:image")) {
        const uploadedUrl = await uploadImage(src, {
          folder: "fabric_images",
        });
        obj.src = uploadedUrl;
        imgURLs.push(uploadedUrl);
      } else {
        imgURLs.push(src);
      }
    }
    for (const child of obj.objects || []) await visit(child);
    if (obj.backgroundImage) await visit(obj.backgroundImage);
    if (obj.overlayImage) await visit(obj.overlayImage);
    if (obj.clipPath) await visit(obj.clipPath);
  }
  await visit(fabricEdit);

  return { fabricEdit, imgURLs };
};
