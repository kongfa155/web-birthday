// utils/uploadFabricJSON.js
import cloudinary from "../config/cloudinary.js";
import { randomUUID } from "node:crypto";

/**
 * Upload Fabric JSON (string) lên Cloudinary dưới dạng file raw
 * @param {string} fabricJSON - string JSON của canvas
 * Legacy callers may pass a name; shared public IDs are deliberately not used.
 * @returns {Promise<string>} URL file JSON trên Cloudinary
 */
export const uploadFabricJSON = async (fabricJSON) => {
  try {
    // Chuyển string JSON thành buffer
    const buffer = Buffer.from(fabricJSON, "utf-8");

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw", // Upload dưới dạng file raw
          folder: "fabric_json", // Thư mục trên Cloudinary
          public_id: randomUUID(), // Prevent name collisions overwriting another account's design.
          overwrite: false,
        },
        (error, result) => {
          if (error) {
            console.error("Upload Fabric JSON error:", error);
            reject(error);
          } else {
            resolve(result.secure_url); // Trả về link URL
          }
        }
      );

      // Gửi buffer lên Cloudinary
      stream.end(buffer);
    });
  } catch (err) {
    console.error("Upload Fabric JSON failed:", err);
    throw err;
  }
};
