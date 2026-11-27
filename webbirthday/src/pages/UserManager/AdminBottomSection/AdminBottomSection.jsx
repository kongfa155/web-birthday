import React, { useEffect, useState } from "react";
import styles from "./AdminBottomSection.module.css";
import UserDetailDrawer from "../UserDetailDrawer/UserDetailDrawer";
import { getUsers, updateUserStatus } from "../../../services/userService";
import { toast } from "react-toastify";

const AdminBottomSection = (props) => {
  const [accounts, setAccounts] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const { searchTerm } = props;

  useEffect(() => {
    let active = true;
    const fetchUsers = async () => {
      try {
        const data = await getUsers();
        if (active) {
          setAccounts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          toast.error("Không thể lấy danh sách người dùng");
          console.error(err);
        }
      }
    };
    fetchUsers();

    return () => {
      active = false;
    };
  }, []);

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

  const filteredAccounts = accounts.filter((acc) =>
    (acc.username || "").toLowerCase().includes((searchTerm || "").toLowerCase())
  );

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
          {filteredAccounts.map((acc) => (
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
          ))}
          {filteredAccounts.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", padding: "20px" }}>
                Không tìm thấy người dùng phù hợp
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
