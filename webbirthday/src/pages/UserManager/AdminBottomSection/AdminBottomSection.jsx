import React, { useEffect, useMemo, useState } from "react";
import styles from "./AdminBottomSection.module.css";
import UserDetailDrawer from "../UserDetailDrawer/UserDetailDrawer";
import { getUsers, updateUserStatus } from "../../../services/userService";
import { toast } from "react-toastify";

const AdminBottomSection = ({
  searchTerm = "",
  sortOrder = "default",
  refreshTrigger = 0,
}) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchUsers = async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await getUsers();
        if (active) {
          setAccounts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          setError(true);
          toast.error("Không thể lấy danh sách người dùng");
          console.error(err);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchUsers();

    return () => {
      active = false;
    };
  }, [refreshTrigger, retryTrigger]);

  const toggleStatus = async (id, currentStatus) => {
    try {
      const updatedUser = await updateUserStatus(id, !currentStatus);
      const newStatus =
        updatedUser && updatedUser.isActive !== undefined
          ? updatedUser.isActive
          : !currentStatus;

      setAccounts((prev) =>
        prev.map((acc) =>
          acc._id === id ? { ...acc, isActive: newStatus } : acc
        )
      );

      // Avoid stale selected drawer when updating table status
      setSelectedUser((prev) =>
        prev && prev._id === id ? { ...prev, isActive: newStatus } : prev
      );
    } catch (err) {
      toast.error("Không thể cập nhật trạng thái");
      console.error(err);
    }
  };

  const displayedAccounts = useMemo(() => {
    const normalizedSearch = (searchTerm || "").trim().toLowerCase();
    const filtered = accounts.filter((acc) =>
      (acc.username || "").toLowerCase().includes(normalizedSearch)
    );

    if (sortOrder === "default") {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const countA = Number(a.cardCount ?? 0);
      const countB = Number(b.cardCount ?? 0);
      if (countA !== countB) {
        return sortOrder === "card-asc" ? countA - countB : countB - countA;
      }
      const nameDiff = (a.username || "").localeCompare(b.username || "", "vi", {
        sensitivity: "base",
      });
      if (nameDiff !== 0) return nameDiff;
      const exactNameDiff = (a.username || "").localeCompare(b.username || "");
      if (exactNameDiff !== 0) return exactNameDiff;
      return String(a._id || "").localeCompare(String(b._id || ""));
    });
  }, [accounts, searchTerm, sortOrder]);

  return (
    <div className={styles.adminBottomSection}>
      <table className={styles.accountTable}>
        <thead>
          <tr>
            <th>Username</th>
            <th>Số thiệp</th>
            <th>Trạng thái</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3} className={styles.stateCell}>
                Đang tải danh sách tài khoản...
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={3} className={styles.stateCell}>
                <span>Không thể tải danh sách người dùng.</span>{" "}
                <button
                  type="button"
                  className={styles.retryBtn}
                  onClick={() => setRetryTrigger((prev) => prev + 1)}
                >
                  Thử lại
                </button>
              </td>
            </tr>
          ) : displayedAccounts.length > 0 ? (
            displayedAccounts.map((acc) => (
              <tr
                key={acc._id}
                onDoubleClick={() => setSelectedUser(acc)}
                style={{ cursor: "pointer" }}
                title="Nhấn đúp để xem chi tiết"
              >
                <td>{acc.username}</td>
                <td>{acc.cardCount ?? 0}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={acc.isActive ?? true}
                    onChange={() => toggleStatus(acc._id, acc.isActive ?? true)}
                    aria-label={`Trạng thái hoạt động của ${acc.username}`}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className={styles.stateCell}>
                {accounts.length === 0
                  ? "Chưa có tài khoản nào"
                  : "Không tìm thấy người dùng phù hợp"}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <UserDetailDrawer
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
};

export default AdminBottomSection;
