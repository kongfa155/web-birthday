// controllers/TemplateController.js
import Template from "../models/Template.js";
import { processFabricEditImages } from "../utils/processFabricEdit.js";
import { uploadFabricJSON } from "../utils/uploadFabricJSON.js";
import { parsePage, listPage, TEMPLATE_LIST_FIELDS } from "../utils/listPage.js";
import { DesignInputError, validateDesignRequest, saveDomDesign } from "../utils/designDocument.js";

const TemplateController = {
  // [POST] /api/templates
  create: async (req, res) => {
    try {
      const { name, imgURL, fabricEdit } = req.body;
      if (typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Vui lòng nhập tên mẫu." });

      const design = validateDesignRequest(req.body);
      if (design) {
        const fields = await saveDomDesign(design, req.body.preview);
        const template = new Template({ name: name.trim(), owner: req.user._id, ...fields });
        await template.save();
        return res.status(201).json({ message: "Đã tạo mẫu thiệp.", template });
      }

      const fabricEditObj =
        typeof fabricEdit === "string" ? JSON.parse(fabricEdit) : fabricEdit;
      if (!fabricEditObj || !Array.isArray(fabricEditObj.objects)) throw new DesignInputError("Invalid Fabric design");

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
      if (err instanceof DesignInputError || err instanceof SyntaxError) return res.status(400).json({ message: "Dữ liệu thiết kế không hợp lệ." });
      console.error("Error creating template:", err);
      res.status(500).json({ message: "Không thể tạo mẫu thiệp." });
    }
  },

  // [GET] /api/templates
  getAll: async (req, res) => {
    const page = parsePage(req.query);
    if (!page) return res.status(400).json({ message: "Tham số phân trang không hợp lệ." });
    try {
      res.json(await listPage(Template, {}, TEMPLATE_LIST_FIELDS, page, { path: "owner", select: "username" }));
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

      const design = validateDesignRequest(req.body);
      if (design) {
        const fields = await saveDomDesign(design, req.body.preview);
        const template = await Template.findByIdAndUpdate(id, { name: name.trim(), ...fields }, { new: true, runValidators: true });
        if (!template) return res.status(404).json({ message: "Template not found" });
        return res.json({ message: "Đã cập nhật mẫu thiệp.", template });
      }
      // Metadata-only updates retain the existing design and thumbnail.
      if (fabricEdit === undefined) {
        const template = await Template.findByIdAndUpdate(id, { name: name.trim() }, { new: true, runValidators: true });
        return res.json({ message: "Đã cập nhật mẫu thiệp.", template });
      }
      const existing = await Template.findById(id);
      if (existing?.designUrl) return res.status(400).json({ message: "Mẫu DOM không nhận dữ liệu Fabric." });

      const fabricEditObj =
        typeof fabricEdit === "string" ? JSON.parse(fabricEdit) : fabricEdit;
      if (!fabricEditObj || !Array.isArray(fabricEditObj.objects)) throw new DesignInputError("Invalid Fabric design");

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
      if (err instanceof DesignInputError || err instanceof SyntaxError) return res.status(400).json({ message: "Dữ liệu thiết kế không hợp lệ." });
      console.error("Error updating template:", err);
      res.status(500).json({ message: "Không thể cập nhật mẫu thiệp." });
    }
  },
};

export default TemplateController;
