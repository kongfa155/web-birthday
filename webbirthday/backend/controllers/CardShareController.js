import crypto from "node:crypto";
import Card from "../models/Card.js";
import { editableCards, readableCards } from "../utils/cardAccess.js";

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CARD_NOT_FOUND_MESSAGE = "Không tìm thấy thiệp.";
const SHARED_CARD_NOT_FOUND_MESSAGE = "Không tìm thấy thiệp được chia sẻ.";

function hashShareToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function shareHeaders(_req, res, next) {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
  });
  return next();
}

const CardShareController = {
  // [GET] /api/cards/:id/share
  getShareStatus: async (req, res) => {
    try {
      const card = await Card.findOne({
        _id: req.params.id,
        ...readableCards(req.user),
      }).select("shareEnabled");

      if (!card) {
        return res.status(404).json({ message: CARD_NOT_FOUND_MESSAGE });
      }

      return res.json({ shareEnabled: card.shareEnabled === true });
    } catch {
      return res.status(500).json({ message: "Không thể lấy trạng thái chia sẻ." });
    }
  },

  // [POST] /api/cards/:id/share
  createOrRotateShare: async (req, res) => {
    try {
      const shareToken = crypto.randomBytes(32).toString("base64url");
      const shareTokenHash = hashShareToken(shareToken);

      const card = await Card.findOneAndUpdate(
        { _id: req.params.id, ...editableCards(req.user) },
        { $set: { shareEnabled: true, shareTokenHash } },
        { new: true, runValidators: true }
      ).select("shareEnabled");

      if (!card) {
        return res.status(404).json({ message: CARD_NOT_FOUND_MESSAGE });
      }

      return res.json({ shareEnabled: true, shareToken });
    } catch {
      return res.status(500).json({ message: "Không thể tạo liên kết chia sẻ." });
    }
  },

  // [DELETE] /api/cards/:id/share
  disableShare: async (req, res) => {
    try {
      const card = await Card.findOneAndUpdate(
        { _id: req.params.id, ...editableCards(req.user) },
        { $set: { shareEnabled: false }, $unset: { shareTokenHash: 1 } },
        { new: true, runValidators: true }
      ).select("shareEnabled");

      if (!card) {
        return res.status(404).json({ message: CARD_NOT_FOUND_MESSAGE });
      }

      return res.json({ shareEnabled: false });
    } catch {
      return res.status(500).json({ message: "Không thể tắt chia sẻ thiệp." });
    }
  },

  // [GET] /api/shared-cards/:token
  getSharedCard: async (req, res) => {
    const { token } = req.params;
    if (typeof token !== "string" || !SHARE_TOKEN_PATTERN.test(token)) {
      return res.status(404).json({ message: SHARED_CARD_NOT_FOUND_MESSAGE });
    }

    try {
      const shareTokenHash = hashShareToken(token);
      const card = await Card.findOne({
        shareEnabled: true,
        shareTokenHash,
      }).select("cardName cardDESC designUrl designFormat previewUrl");

      if (!card || card.shareEnabled === false) {
        return res.status(404).json({ message: SHARED_CARD_NOT_FOUND_MESSAGE });
      }

      const dto = { cardName: card.cardName };
      if (card.cardDESC !== undefined) dto.cardDESC = card.cardDESC;
      if (card.designUrl !== undefined) dto.designUrl = card.designUrl;
      if (card.designFormat !== undefined) dto.designFormat = card.designFormat;
      if (card.previewUrl !== undefined) dto.previewUrl = card.previewUrl;
      return res.json(dto);
    } catch {
      return res.status(500).json({ message: "Không thể tải thiệp được chia sẻ." });
    }
  },
};

export default CardShareController;
export { SHARED_CARD_NOT_FOUND_MESSAGE };
