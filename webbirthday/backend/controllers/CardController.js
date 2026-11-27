// controllers/CardController.js
import Card from "../models/Card.js";
import Template from "../models/Template.js";
import mongoose from "mongoose";
import { processFabricEditImages } from "../utils/processFabricEdit.js";
import { uploadFabricJSON } from "../utils/uploadFabricJSON.js";
import { editableCards, readableCards } from "../utils/cardAccess.js";
import { parsePage, listPage, CARD_LIST_FIELDS } from "../utils/listPage.js";
import { DesignInputError, validateDesignRequest, saveDomDesign } from "../utils/designDocument.js";

function parseDesign(value) {
  const design = typeof value === "string" ? JSON.parse(value) : value;
  if (!design || typeof design !== "object" || !Array.isArray(design.objects)) throw new SyntaxError("Invalid design");
  return design;
}

const CardController = {
  // [GET] /api/cards
  getAll: async (req, res) => {
    const page = parsePage(req.query);
    if (!page) return res.status(400).json({ message: "Tham số phân trang không hợp lệ." });
    try {
      res.json(await listPage(Card, readableCards(req.user), CARD_LIST_FIELDS, page));
    } catch {
      res.status(500).json({ message: "Không thể lấy danh sách thiệp." });
    }
  },

  // [GET] /api/cards/:id
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const card = await Card.findOne({ _id: id, ...readableCards(req.user) }).populate("owner", "username");
      if (!card) return res.status(404).json({ message: "Card not found" });

      res.json(card);
    } catch {
      res.status(500).json({ message: "Không thể lấy thông tin thiệp." });
    }
  },

  // [POST] /api/cards
  create: async (req, res) => {
    try {
      const { cardName, imgURL, cardDESC, fabricEdit } = req.body;
      if (typeof cardName !== "string" || !cardName.trim()) return res.status(400).json({ message: "Vui lòng nhập tên thiệp." });
      if (req.body.owner && String(req.body.owner) !== String(req.user._id)) return res.status(403).json({ message: "Không thể tạo thiệp thay cho tài khoản khác." });

      // Resolve the source on the server; never accept a client-supplied source URL.
      let source;
      if (req.body.templateId !== undefined) {
        if (typeof req.body.templateId !== "string" || !mongoose.isObjectIdOrHexString(req.body.templateId)) return res.status(400).json({ message: "Mã mẫu không hợp lệ." });
        source = await Template.findById(req.body.templateId);
        if (!source) return res.status(404).json({ message: "Không tìm thấy mẫu thiệp." });
      } else if (!req.user.isAdmin && req.body.blank !== true) {
        return res.status(400).json({ message: "Vui lòng chọn mẫu thiệp." });
      }

      const domDesign = validateDesignRequest(req.body);

      let fabricURL = source?.fabricEdit;
      let imgURLs = source?.imgURL || imgURL || [];
      let designFields = source?.designUrl ? {
        designUrl: source.designUrl, designFormat: source.designFormat, previewUrl: source.previewUrl,
      } : {};
      if (source?.designUrl && fabricEdit !== undefined) return res.status(400).json({ message: "Mẫu hiện tại không nhận dữ liệu Fabric." });
      if (domDesign) designFields = await saveDomDesign(domDesign, req.body.preview);

      if (fabricEdit !== undefined) {
        const fabricEditObj =
          parseDesign(fabricEdit);

        // Upload tất cả ảnh trong canvas
        const { fabricEdit: processedEdit, imgURLs: uploadedImgs } =
          await processFabricEditImages(fabricEditObj);

        // Upload JSON canvas lên Cloudinary
        const fabricJSONStr = JSON.stringify(processedEdit);
        fabricURL = await uploadFabricJSON(fabricJSONStr, cardName);

        imgURLs = uploadedImgs;
      }

      const newCard = new Card({
        cardName,
        imgURL: imgURLs,
        cardDESC,
        fabricEdit: fabricURL,
        ...designFields,
        owner: req.user._id,
        isEditable: true, // mặc định mới tạo là có thể chỉnh sửa
      });

      await newCard.save();

      res.status(201).json({ message: "Card created", card: newCard });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof DesignInputError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Không thể tạo thiệp." });
    }
  },

  // [PUT] /api/cards/:id
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { cardName, imgURL, cardDESC, fabricEdit, owner, isEditable } =
        req.body;
      // Check access before parsing designs or uploading any content.
      const filter = { _id: id, ...editableCards(req.user) };
      const existing = await Card.findOne(filter);
      if (!existing) return res.status(404).json({ message: "Card not found" });
      if (owner && String(owner) !== String(req.user._id)) return res.status(403).json({ message: "Không thể chuyển chủ sở hữu thiệp qua API này." });
      if (typeof isEditable !== "undefined" && typeof isEditable !== "boolean") return res.status(400).json({ message: "Trạng thái thiệp không hợp lệ." });
      if (cardName !== undefined && (typeof cardName !== "string" || !cardName.trim())) return res.status(400).json({ message: "Tên thiệp không hợp lệ." });
      const domDesign = validateDesignRequest(req.body);
      if (existing.designUrl && fabricEdit !== undefined) return res.status(400).json({ message: "Thiệp DOM không nhận dữ liệu Fabric." });
      const updatedFields = {};
      for (const [key, value] of Object.entries({ cardName, imgURL, cardDESC })) {
        if (value !== undefined) updatedFields[key] = value;
      }

      // Cho phép cập nhật trạng thái isEditable
      if (typeof isEditable !== "undefined") {
        updatedFields.isEditable = isEditable;
      }
      if (domDesign) Object.assign(updatedFields, await saveDomDesign(domDesign, req.body.preview));

      // Chỉ xử lý Fabric JSON khi gửi dữ liệu mới
      if (fabricEdit !== undefined) {
        const fabricEditObj =
          parseDesign(fabricEdit);

        const { fabricEdit: processedEdit, imgURLs: uploadedImgs } =
          await processFabricEditImages(fabricEditObj);

        const fabricJSONStr = JSON.stringify(processedEdit);
        const fabricURL = await uploadFabricJSON(fabricJSONStr, cardName);

        updatedFields.fabricEdit = fabricURL;
        updatedFields.imgURL = uploadedImgs;
      }

      const updatedCard = await Card.findOneAndUpdate(filter, updatedFields, {
        new: true,
        runValidators: true,
      });

      if (!updatedCard)
        return res.status(404).json({ message: "Card not found" });

      res.json({ message: "Card updated", card: updatedCard });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof DesignInputError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Không thể cập nhật thiệp." });
    }
  },

  remove: async (req, res) => {
    try {
      const card = await Card.findOneAndDelete({ _id: req.params.id, ...editableCards(req.user) });
      if (!card) return res.status(404).json({ message: "Không tìm thấy thiệp." });
      // Shared template images must not be deleted from Cloudinary.
      return res.json({ message: "Đã xóa thiệp." });
    } catch {
      return res.status(500).json({ message: "Không thể xóa thiệp." });
    }
  },
};

export default CardController;
