// controllers/CardController.js
import Card from "../models/Card.js";
import Template from "../models/Template.js";
import mongoose from "mongoose";
import { editableCards, readableCards } from "../utils/cardAccess.js";
import { parsePage, listPage, CARD_LIST_FIELDS } from "../utils/listPage.js";
import { DesignInputError, validateDesignRequest, saveDomDesign } from "../utils/designDocument.js";
import { createCardWithinQuota, CardCreationError } from "../utils/cardCreationQuota.js";

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
      const { cardName, imgURL, cardDESC } = req.body;
      if (typeof cardName !== "string" || !cardName.trim()) return res.status(400).json({ message: "Vui lòng nhập tên thiệp." });
      if (req.body.owner && String(req.body.owner) !== String(req.user._id)) return res.status(403).json({ message: "Không thể tạo thiệp thay cho tài khoản khác." });

      // Resolve the source on the server; never accept a client-supplied source URL.
      let source;
      if (req.body.templateId !== undefined) {
        if (typeof req.body.templateId !== "string" || !mongoose.isObjectIdOrHexString(req.body.templateId)) return res.status(400).json({ message: "Mã mẫu không hợp lệ." });
        source = await Template.findById(req.body.templateId);
        if (!source) return res.status(404).json({ message: "Không tìm thấy mẫu thiệp." });
        if (source.designFormat !== "dom" || !source.designUrl) {
          return res.status(400).json({ message: "Mẫu thiệp không sử dụng định dạng DOM hợp lệ." });
        }
      } else if (!req.user.isAdmin && req.body.blank !== true) {
        return res.status(400).json({ message: "Vui lòng chọn mẫu thiệp." });
      }

      const domDesign = validateDesignRequest(req.body);

      const imgURLs = source?.imgURL || imgURL || [];
      const designFields = source?.designUrl ? {
        designUrl: source.designUrl, designFormat: source.designFormat, previewUrl: source.previewUrl,
      } : {};

      // Lazy-cache external uploads outside the retryable transaction callback
      // so write-conflict retries never duplicate Cloudinary assets.
      let preparedDesignPromise = null;
      const getPreparedDesign = () => {
        if (!domDesign) return Promise.resolve(null);
        if (!preparedDesignPromise) {
          preparedDesignPromise = saveDomDesign(domDesign, req.body.preview);
        }
        return preparedDesignPromise;
      };

      const createdCard = await createCardWithinQuota(req.user, async (session) => {
        const uploadedDesign = await getPreparedDesign();
        const resolvedDesignFields = uploadedDesign || designFields;
        const newCard = new Card({
          cardName,
          imgURL: imgURLs,
          cardDESC,
          ...resolvedDesignFields,
          owner: req.user._id,
          isEditable: true, // mặc định mới tạo là có thể chỉnh sửa
        });
        return session ? newCard.save({ session }) : newCard.save();
      });

      res.status(201).json({ message: "Card created", card: createdCard });
    } catch (error) {
      if (error instanceof CardCreationError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      if (error instanceof SyntaxError || error instanceof DesignInputError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Không thể tạo thiệp." });
    }
  },

  // [PUT] /api/cards/:id
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { cardName, imgURL, cardDESC, owner, isEditable } =
        req.body;
      // Check access before parsing designs or uploading any content.
      const filter = { _id: id, ...editableCards(req.user) };
      const existing = await Card.findOne(filter);
      if (!existing) return res.status(404).json({ message: "Card not found" });
      if (owner && String(owner) !== String(req.user._id)) return res.status(403).json({ message: "Không thể chuyển chủ sở hữu thiệp qua API này." });
      if (typeof isEditable !== "undefined" && typeof isEditable !== "boolean") return res.status(400).json({ message: "Trạng thái thiệp không hợp lệ." });
      if (cardName !== undefined && (typeof cardName !== "string" || !cardName.trim())) return res.status(400).json({ message: "Tên thiệp không hợp lệ." });
      const domDesign = validateDesignRequest(req.body);
      const updatedFields = {};
      for (const [key, value] of Object.entries({ cardName, imgURL, cardDESC })) {
        if (value !== undefined) updatedFields[key] = value;
      }

      // Cho phép cập nhật trạng thái isEditable
      if (typeof isEditable !== "undefined") {
        updatedFields.isEditable = isEditable;
      }
      if (domDesign) Object.assign(updatedFields, await saveDomDesign(domDesign, req.body.preview));

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
