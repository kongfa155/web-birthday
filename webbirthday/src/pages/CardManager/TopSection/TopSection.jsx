import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTemplates } from "../../../services/templateService";
import { toast } from "react-toastify";
import styles from "./TopSection.module.css";
import { useAuth } from "../../../context/AuthContext"; // Import useAuth
import usePagedList from "../../../hooks/usePagedList";
import { createCard } from "../../../services/cardService";

const TopSection = () => {
  const [openDrawer, setOpenDrawer] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth(); // Lấy thông tin user
  const [creating, setCreating] = useState(false);
  const { items: templates, loading, error, hasMore, loadMore, retry } = usePagedList(getTemplates, user?._id, openDrawer);

  const handleChooseTemplate = async (template) => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await createCard({ templateId: template._id, cardName: `${template.name} - Thiệp của tôi` });
      navigate(`/edit/cards/${res.data.card._id}`);
    } catch {
      toast.error("Không thể tạo thiệp từ mẫu. Vui lòng thử lại.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBlank = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await createCard({ cardName: "Thiệp sinh nhật của tôi", blank: true });
      navigate(`/edit/cards/${data.card._id}`);
    } catch {
      toast.error("Không thể tạo thiệp mới. Vui lòng thử lại.");
    } finally { setCreating(false); }
  };


  return (
    <div className={styles.topSection}>
      <div className={styles.containWrapper}>
        <h1 className={styles.title}>CARDS</h1>
        {/*Kiểm tra "user.isAdmin" thay vì "user.role" */}
        {user && (
          <button
            className={styles.pillBtn}
            onClick={() => setOpenDrawer(true)}
          >
            + Tạo thiệp từ mẫu
          </button>
        )}
      </div>

      {/* Drawer */}
      {openDrawer && (
        <>
          <div className={`${styles.drawer} ${openDrawer ? styles.drawerOpen : ""}`}>
            <div className={styles.drawerHeader}>
              <h2>Chọn mẫu thiệp</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setOpenDrawer(false)}
              >
                &times;
              </button>
            </div>
            <div className={`${styles.drawerBody} ${styles.horizontalScroll}`}>
              <button type="button" className={styles.templateCard} disabled={creating} onClick={handleCreateBlank}>
                <img src="/hpbd.png" alt="Tạo thiệp mới" />
                <p>Bắt đầu thiệp mới</p>
                <small>Chọn mẫu sinh nhật trong trình thiết kế</small>
              </button>
              {loading && <p role="status">Đang tải mẫu thiệp...</p>}
              {error && <p role="alert">Không thể tải mẫu thiệp. <button type="button" onClick={retry} disabled={loading}>Thử lại</button></p>}
              {!loading && !error && templates.length === 0 && <p>Bạn có thể bắt đầu thiệp mới với thư viện mẫu dựng sẵn trong trình thiết kế.</p>}
              {templates.map((template) => (
                <button
                  type="button"
                  disabled={creating}
                  key={template._id}
                  className={styles.templateCard}
                  onClick={() => handleChooseTemplate(template)}
                >
                  <img loading="lazy" decoding="async" src={template.previewUrl || template.imgURL?.[0] || "/hpbd.png"} alt={template.name} />
                  <p>{template.name}</p>
                </button>
              ))}
              {hasMore && <button type="button" disabled={loading} onClick={loadMore}>{loading ? "Đang tải..." : "Xem thêm mẫu"}</button>}
            </div>
          </div>
          <div
            className={styles.drawerOverlay}
            onClick={() => setOpenDrawer(false)}
          />
        </>
      )}
    </div>
  );
};

export default TopSection;
