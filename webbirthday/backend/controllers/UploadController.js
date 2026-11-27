import { uploadImage } from "../services/cloudinaryService.js";

const BASE64_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const UploadController = {
  uploadBase64: async (req, res) => {
    try {
      const { base64 } = req.body;
      if (typeof base64 !== "string" || !BASE64_IMAGE_REGEX.test(base64)) {
        return res.status(400).json({ message: "Chỉ chấp nhận ảnh PNG, JPEG, WebP hoặc GIF dạng base64." });
      }
      if (Buffer.byteLength(base64.split(",")[1], "base64") > MAX_IMAGE_BYTES) {
        return res.status(413).json({ message: "Ảnh không được vượt quá 5 MB." });
      }

      const url = await uploadImage(base64, {
        folder: "fabric_images",
        resource_type: "image",
      });

      res.json({ url });
    } catch (error) {
      console.error("Upload thất bại:", error);
      res.status(500).json({ message: "Upload thất bại" });
    }
  },
};

export default UploadController;
