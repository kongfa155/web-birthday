// controllers/TemplateController.js
import Template from "../models/Template.js";
import { processFabricEditImages } from "../utils/processFabricEdit.js";
import { uploadFabricJSON } from "../utils/uploadFabricJSON.js";

const TemplateController = {
  // [POST] /api/templates
  create: async (req, res) => {
    try {
      const { name, imgURL, fabricEdit } = req.body;
      if (typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Vui lòng nhập tên mẫu." });

      const fabricEditObj =
        typeof fabricEdit === "string" ? JSON.parse(fabricEdit) : fabricEdit;

      // Upload tất cả ảnh trong canvas
      const { fabricEdit: processedEdit, imgURLs } =
        await processFabricEditImages(fabricEditObj);

      // Upload JSON canvas lên Cloudinary
      const fabricJSONStr = JSON.stringify(processedEdit);
      const fabricURL = await uploadFabricJSON(fabricJSONStr, name);

      const newTemplate = new Template({
        name,
        owner: req.user._id,
        imgURL: imgURLs.length > 0 ? imgURLs : imgURL,
        fabricEdit: fabricURL, // 🔥 lưu URL vào fabricEdit
      });

      await newTemplate.save();

      res.status(201).json({
        message: "Template created successfully",
        template: newTemplate,
      });
    } catch (err) {
      console.error("Error creating template:", err);
      res.status(500).json({ message: "Không thể tạo mẫu thiệp." });
    }
  },

  // [GET] /api/templates
  getAll: async (req, res) => {
    try {
      const templates = await Template.find().populate("owner", "username");
      res.json(templates);
    } catch {
      res.status(500).json({ message: "Không thể lấy danh sách mẫu thiệp." });
    }
  },

  // [GET] /api/templates/:id
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const template = await Template.findById(id).populate(
        "owner",
        "username"
      );
      if (!template)
        return res.status(404).json({ message: "Template not found" });

      res.json(template);
    } catch {
      res.status(500).json({ message: "Không thể lấy mẫu thiệp." });
    }
  },

  // [PUT] /api/templates/:id
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, imgURL, fabricEdit } = req.body;
      if (typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Vui lòng nhập tên mẫu." });
      if (!await Template.exists({ _id: id })) return res.status(404).json({ message: "Template not found" });

      const fabricEditObj =
        typeof fabricEdit === "string" ? JSON.parse(fabricEdit) : fabricEdit;

      const { fabricEdit: processedEdit, imgURLs } =
        await processFabricEditImages(fabricEditObj);

      // Upload JSON canvas lên Cloudinary
      const fabricJSONStr = JSON.stringify(processedEdit);
      const fabricURL = await uploadFabricJSON(fabricJSONStr, name);

      const updatedTemplate = await Template.findByIdAndUpdate(
        id,
        {
          name,
          imgURL: imgURLs.length > 0 ? imgURLs : imgURL,
          fabricEdit: fabricURL, // 🔥 lưu URL vào fabricEdit
        },
        { new: true }
      );

      if (!updatedTemplate) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json({
        message: "Template updated successfully",
        template: updatedTemplate,
      });
    } catch (err) {
      console.error("Error updating template:", err);
      res.status(500).json({ message: "Không thể cập nhật mẫu thiệp." });
    }
  },
};

export default TemplateController;
