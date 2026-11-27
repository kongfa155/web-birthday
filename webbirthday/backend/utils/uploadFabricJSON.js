// utils/uploadFabricJSON.js
import { uploadRawJson } from "../services/cloudinaryService.js";

/**
 * Upload Fabric JSON (string) lên Cloudinary dưới dạng file raw
 * @param {string} fabricJSON - string JSON của canvas
 * Legacy callers may pass a name; shared public IDs are deliberately not used.
 * @returns {Promise<string>} URL file JSON trên Cloudinary
 */
export const uploadFabricJSON = async (fabricJSON) => {
  try {
    return await uploadRawJson(fabricJSON, "fabric_json");
  } catch (err) {
    console.error("Upload Fabric JSON failed:", err);
    throw err;
  }
};
