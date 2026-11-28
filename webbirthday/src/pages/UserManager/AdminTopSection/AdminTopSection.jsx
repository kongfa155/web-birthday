import React, { useState } from "react";
import styles from "./AdminTopSection.module.css";
import { FaSearch } from "react-icons/fa";
import ModalCreateUser from "../ModalCreateUser/ModalCreateUser";

const AdminTopSection = ({
  searchTerm,
  setSearchTerm,
  sortOrder,
  setSortOrder,
  stats,
  statsLoading,
  statsError,
  onRetryStats,
  onUserCreated,
}) => {
  const [showModalCreateUser, setShowModalCreateUser] = useState(false);

  const renderStatValue = (value) => {
    if (statsLoading) return "Đang tải...";
    if (statsError) return "Lỗi tải";
    return value ?? 0;
  };

  return (
    <div className={styles.adminTopSection}>
      <div className={styles.leftSection}>
        <h1 className={styles.adminTitle}>ACCOUNTS</h1>
        <button
          type="button"
          className={styles.pillBtn}
          onClick={() => setShowModalCreateUser(true)}
        >
          + New User
        </button>
      </div>

      <ModalCreateUser
        show={showModalCreateUser}
        setShow={setShowModalCreateUser}
        onUserCreated={onUserCreated}
      />

      <div className={styles.statsGroup} aria-label="Thống kê hệ thống">
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tổng người dùng</span>
          <span
            className={statsError ? styles.statErrorValue : styles.statValue}
          >
            {renderStatValue(stats?.userCount)}
          </span>
          <span className={styles.statSub}>Tài khoản User (không tính Admin)</span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tổng số thiệp</span>
          <span
            className={statsError ? styles.statErrorValue : styles.statValue}
          >
            {renderStatValue(stats?.cardCount)}
          </span>
          <span className={styles.statSub}>Tất cả thiệp trong hệ thống</span>
        </div>

        {statsError && (
          <button
            type="button"
            className={styles.retryBtn}
            onClick={onRetryStats}
          >
            Thử lại
          </button>
        )}
      </div>

      <div className={styles.topActions}>
        <div className={styles.searchBar}>
          <FaSearch className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Tìm theo tên người dùng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Tìm theo tên người dùng"
          />
        </div>

        <label className={styles.sortControl}>
          <span className={styles.sortLabel}>Sắp xếp:</span>
          <select
            className={styles.sortSelect}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            aria-label="Sắp xếp tài khoản theo số thiệp"
          >
            <option value="default">Mặc định</option>
            <option value="card-desc">Số thiệp giảm dần</option>
            <option value="card-asc">Số thiệp tăng dần</option>
          </select>
        </label>
      </div>
    </div>
  );
};

export default AdminTopSection;
