// models/Card.js
import mongoose from "mongoose";

const cardSchema = new mongoose.Schema(
  {
    cardName: { type: String, required: true },
    isEditable: { type: Boolean, default: true },
    imgURL: [{ type: String }],
    cardDESC: { type: String },
    fabricEdit: { type: String }, // ✅ Đổi về String
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    shareEnabled: { type: Boolean, default: false },
    shareTokenHash: { type: String, select: false },
  },
  { timestamps: true }
);

export const CARD_SHARE_INDEX_KEY = { shareTokenHash: 1 };
export const CARD_SHARE_INDEX_OPTIONS = {
  name: "shareTokenHash_unique",
  unique: true,
  partialFilterExpression: { shareTokenHash: { $type: "string" } },
};

// Applied explicitly via backend/scripts/ensure-card-share-index.js; autoIndex stays disabled.
cardSchema.index(CARD_SHARE_INDEX_KEY, CARD_SHARE_INDEX_OPTIONS);

cardSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.shareTokenHash;
    return ret;
  },
});

const Card = mongoose.model("Card", cardSchema);
export default Card;
