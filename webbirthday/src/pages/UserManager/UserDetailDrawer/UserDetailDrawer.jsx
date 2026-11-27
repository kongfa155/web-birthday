import React from "react";
import styles from "./UserDetailDrawer.module.css";

const UserDetailDrawer = ({ user, onClose }) => {
  if (!user) return null;

  return (
    <div className={styles.drawerOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()} // avoid closing when clicking inside
      >
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Đóng chi tiết người dùng"
          type="button"
        >
          ✖
        </button>

        <h2>Thông tin tài khoản</h2>
        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p>
            <strong>Tên người dùng:</strong> {user.username}
          </p>
          <p>
            <strong>Vai trò:</strong> {user.isAdmin ? "Quản trị viên (Admin)" : "Người dùng (User)"}
          </p>
          <p>
            <strong>Trạng thái:</strong>{" "}
            <span style={{ color: user.isActive !== false ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
              {user.isActive !== false ? "Đang hoạt động" : "Đã bị vô hiệu hóa"}
            </span>
          </p>
          <p>
            <strong>Số thiệp:</strong> {user.cardCount ?? 0}
          </p>
          <p>
            <strong>Số file được tham chiếu trong thiệp:</strong> {user.fileCount ?? 0}
          </p>
          <p>
            <strong>Ngày tạo:</strong>{" "}
            {user.createdAt ? new Date(user.createdAt).toLocaleString("vi-VN") : "N/A"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserDetailDrawer;
