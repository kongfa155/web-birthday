import { randomUUID } from "node:crypto";
import cloudinary from "../config/cloudinary.js";

/**
 * Upload an image (data URL or source string) to Cloudinary.
 * @param {string} source
 * @param {object} [options]
 * @returns {Promise<string>}
 */
export async function uploadImage(source, options = {}) {
  const result = await cloudinary.uploader.upload(source, options);
  return result.secure_url;
}

/**
 * Upload raw JSON content to Cloudinary using a stream with a unique public ID.
 * @param {string|Buffer} content
 * @param {string} folder
 * @returns {Promise<string>}
 */
export async function uploadRawJson(content, folder) {
  const buffer = Buffer.from(content, "utf-8");

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder,
        public_id: randomUUID(),
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    stream.end(buffer);
  });
}
