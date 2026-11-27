// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: {
      type: String,
      required: function () { return !this.googleSub; },
    },
    googleSub: { type: String, minlength: 1, maxlength: 255 },
    email: { type: String, maxlength: 320 },
    isAdmin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    // ❌ bỏ userID
    cards: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card" }],
  },
  { timestamps: true }
);

// Applied explicitly only after approval; server startup keeps autoIndex disabled.
userSchema.index({ googleSub: 1 }, {
  name: "googleSub_unique",
  unique: true,
  partialFilterExpression: { googleSub: { $type: "string" } },
  collation: { locale: "simple" },
});

const User = mongoose.model("User", userSchema);
export default User;
