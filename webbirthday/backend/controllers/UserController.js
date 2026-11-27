import User from "../models/User.js";
import Card from "../models/Card.js";
import bcrypt from "bcrypt";
import { createSession, hashPassword, normalizeUsername, safeUser, SAFE_USER_FIELDS, validateCredentials } from "../utils/auth.js";
import { hasUniqueUsernameIndex } from "../utils/registrationIndex.js";

function accountFailure(error, res) {
  if (error.code === 11000) return res.status(409).json({ message: "Tên đăng nhập đã tồn tại." });
  return res.status(500).json({ message: "Không thể xử lý tài khoản. Vui lòng thử lại." });
}

async function createAccount(req, res, selfRegistration) {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  const validation = validateCredentials(username, password, true);
  if (validation) return res.status(400).json({ message: validation });
  if (!selfRegistration && req.body.role !== undefined && !["USER", "ADMIN"].includes(req.body.role)) {
    return res.status(400).json({ message: "Vai trò tài khoản không hợp lệ." });
  }
  try {
    if (selfRegistration && !process.env.JWT_SECRET) return res.status(503).json({ message: "Dịch vụ đăng ký chưa sẵn sàng." });
    if (!await hasUniqueUsernameIndex()) return res.status(503).json({ message: "Đăng ký chưa sẵn sàng: cần xác nhận ràng buộc tên đăng nhập duy nhất." });
    if (await User.findOne({ username }).collation({ locale: "simple" })) return res.status(409).json({ message: "Tên đăng nhập đã tồn tại." });
    const user = new User({
      username,
      password: await hashPassword(password),
      isAdmin: selfRegistration ? false : req.body.role === "ADMIN",
      isActive: true,
    });
    await user.save();
    if (selfRegistration) return res.status(201).json({ message: "Đăng ký thành công.", ...createSession(user) });
    return res.status(201).json({ message: "User created successfully", user: safeUser(user) });
  } catch (error) {
    return accountFailure(error, res);
  }
}

const UserController = {
  register: (req, res) => createAccount(req, res, true),
  createUser: (req, res) => createAccount(req, res, false),
  login: async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;
    const validation = validateCredentials(username, password);
    if (validation) return res.status(400).json({ message: validation });
    try {
      const user = await User.findOne({ username }).collation({ locale: "simple" });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng." });
      }
      if (user.isActive === false) return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa.", code: "ACCOUNT_DISABLED" });
      return res.json({ message: "Login success", ...createSession(user) });
    } catch {
      return res.status(500).json({ message: "Không thể đăng nhập. Vui lòng thử lại." });
    }
  },
  me: (req, res) => res.json({ user: safeUser(req.user) }),
  getAllUsers: async (req, res) => {
    try {
      const users = await User.find({}, SAFE_USER_FIELDS);
      const counts = await Card.aggregate([
        { $match: { owner: { $in: users.map((user) => user._id) } } },
        { $group: { _id: "$owner", count: { $sum: 1 } } },
      ]);
      const byOwner = new Map(counts.map((item) => [String(item._id), item.count]));
      return res.json(users.map((user) => ({ ...safeUser(user), cardCount: byOwner.get(String(user._id)) || 0 })));
    } catch {
      return res.status(500).json({ message: "Không thể lấy danh sách tài khoản." });
    }
  },
  getUserById: async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select(SAFE_USER_FIELDS);
      if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản." });
      const cardCount = await Card.countDocuments({ owner: user._id });
      return res.json({ ...safeUser(user), cardCount });
    } catch {
      return res.status(500).json({ message: "Không thể lấy thông tin tài khoản." });
    }
  },
  update: async (req, res) => {
    // Status management only: no role/password/ownership changes via this endpoint.
    if (!req.body || Object.keys(req.body).some((key) => key !== "isActive") || typeof req.body.isActive !== "boolean") {
      return res.status(400).json({ message: "Chỉ được cập nhật trạng thái hoạt động bằng giá trị đúng/sai." });
    }
    if (String(req.user._id) === req.params.id && !req.body.isActive) {
      return res.status(400).json({ message: "Không thể tự vô hiệu hóa tài khoản đang sử dụng." });
    }
    try {
      const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true, runValidators: true }).select(SAFE_USER_FIELDS);
      if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản." });
      return res.json({ message: "User updated", user: safeUser(user) });
    } catch {
      return res.status(500).json({ message: "Không thể cập nhật tài khoản." });
    }
  },
};
export default UserController;
