import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import AdminTopSection from "./AdminTopSection/AdminTopSection";
import AdminBottomSection from "./AdminBottomSection/AdminBottomSection";
import { getUserStats } from "../../services/userService";
import styles from "./UserManager.module.css";

const UserManager = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("default");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [statsRetryTrigger, setStatsRetryTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      setStatsLoading(true);
      setStatsError(false);
      try {
        const data = await getUserStats();
        if (!active) return;
        const userCount = Number(data?.userCount);
        const cardCount = Number(data?.cardCount);
        if (!Number.isFinite(userCount) || !Number.isFinite(cardCount)) {
          throw new Error("Invalid stats payload");
        }
        setStats({ userCount, cardCount });
      } catch (err) {
        if (!active) return;
        setStats(null);
        setStatsError(true);
        toast.error("Không thể tải thống kê hệ thống");
        console.error(err);
      } finally {
        if (active) {
          setStatsLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      active = false;
    };
  }, [refreshTrigger, statsRetryTrigger]);

  const handleUserCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleRetryStats = () => {
    setStatsRetryTrigger((prev) => prev + 1);
  };

  return (
    <div className={styles.adminContainer}>
      <AdminTopSection
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        stats={stats}
        statsLoading={statsLoading}
        statsError={statsError}
        onRetryStats={handleRetryStats}
        onUserCreated={handleUserCreated}
      />
      <AdminBottomSection
        searchTerm={searchTerm}
        sortOrder={sortOrder}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
};

export default UserManager;
