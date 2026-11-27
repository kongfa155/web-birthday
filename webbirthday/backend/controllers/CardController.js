// controllers/CardController.js
import Card from "../models/Card.js";
import { processFabricEditImages } from "../utils/processFabricEdit.js";
import { uploadFabricJSON } from "../utils/uploadFabricJSON.js";
import { editableCards, readableCards } from "../utils/cardAccess.js";

const CardController = {
  // [GET] /api/cards
  getAll: async (req, res) => {
    try {
      const cards = await Card.find(
        readableCards(req.user),
        "cardName imgURL cardDESC owner createdAt fabricEdit isEditable"
      ).populate("owner", "username");
      res.json(cards);
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

      let fabricURL;
      let imgURLs = imgURL || [];

      if (fabricEdit) {
        const fabricEditObj =
          typeof fabricEdit === "string" ? JSON.parse(fabricEdit) : fabricEdit;

        // Upload tất cả ảnh trong canvas
        const { fabricEdit: processedEdit, imgURLs: uploadedImgs } =
          await processFabricEditImages(fabricEditObj);

        // Upload JSON canvas lên Cloudinary
        const fabricJSONStr = JSON.stringify(processedEdit);
        fabricURL = await uploadFabricJSON(fabricJSONStr, cardName);

        if (uploadedImgs.length > 0) imgURLs = uploadedImgs;
      }

      const newCard = new Card({
        cardName,
        imgURL: imgURLs,
        cardDESC,
        fabricEdit: fabricURL,
        owner: req.user._id,
        isEditable: true, // mặc định mới tạo là có thể chỉnh sửa
      });

      await newCard.save();

      res.status(201).json({ message: "Card created", card: newCard });
    } catch {
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
      const updatedFields = {};
      for (const [key, value] of Object.entries({ cardName, imgURL, cardDESC })) {
        if (value !== undefined) updatedFields[key] = value;
      }

      // Cho phép cập nhật trạng thái isEditable
      if (typeof isEditable !== "undefined") {
        updatedFields.isEditable = isEditable;
      }

      // Chỉ xử lý Fabric JSON khi gửi dữ liệu mới
      if (fabricEdit) {
        const fabricEditObj =
          typeof fabricEdit === "string" ? JSON.parse(fabricEdit) : fabricEdit;

        const { fabricEdit: processedEdit, imgURLs: uploadedImgs } =
          await processFabricEditImages(fabricEditObj);

        const fabricJSONStr = JSON.stringify(processedEdit);
        const fabricURL = await uploadFabricJSON(fabricJSONStr, cardName);

        updatedFields.fabricEdit = fabricURL;
        if (uploadedImgs.length > 0) updatedFields.imgURL = uploadedImgs;
      }

      const updatedCard = await Card.findOneAndUpdate(filter, updatedFields, {
        new: true,
        runValidators: true,
      });

      if (!updatedCard)
        return res.status(404).json({ message: "Card not found" });

      res.json({ message: "Card updated", card: updatedCard });
    } catch {
      res.status(500).json({ message: "Không thể cập nhật thiệp." });
    }
  },
};

export default CardController;
