import mongoose from "mongoose";
import User from "../models/User.js";
import Card from "../models/Card.js";

export const MAX_USER_CARDS = 20;

export class CardCreationError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "CardCreationError";
    this.status = status;
    this.code = code;
  }
}

export { CardCreationError as CardQuotaError };

// Every User creation serializes on the existing account document before counting.
// withTransaction retries write conflicts; callers must cache external uploads
// outside the retryable callback so a retry never creates duplicate cloud files.
export async function createCardWithinQuota(user, createRecord) {
  if (user.isAdmin === true) return createRecord(null);
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const lock = await User.updateOne(
        { _id: user._id, isAdmin: { $ne: true }, isActive: { $ne: false } },
        { $inc: { __v: 1 } },
        { session, timestamps: false }
      );
      if (lock.matchedCount !== 1) {
        throw new CardCreationError("Tài khoản không còn quyền tạo thiệp.", 403, "ACCOUNT_UNAVAILABLE");
      }
      const countQuery = Card.countDocuments({ owner: user._id }, { session });
      const count = typeof countQuery?.session === "function"
        ? await countQuery.session(session)
        : await countQuery;
      if (count >= MAX_USER_CARDS) {
        throw new CardCreationError(
          "Bạn đã có tối đa 20 thiệp. Hãy xóa một thiệp trước khi tạo thiệp mới.",
          409,
          "CARD_LIMIT_REACHED"
        );
      }
      return createRecord(session);
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary",
      maxCommitTimeMS: 10000,
    });
  } finally {
    await session.endSession();
  }
}
