import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTemplates } from "../../../services/templateService";
import { toast } from "react-toastify";
import styles from "./TopSection.module.css";
import { useAuth } from "../../../context/AuthContext"; // Import useAuth
import { createCard } from "../../../services/cardService";

const TopSection = () => {
  const [openDrawer, setOpenDrawer] = useState(false);
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const { user } = useAuth(); // Lấy thông tin user
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    let active = true;
    if (user) {
      setLoading(true);
      setTemplates([]);
      setError("");
      getTemplates()
        .then((res) => { if (active) setTemplates(res.data); })
        .catch(() => { if (active) setError("Không thể tải mẫu thiệp. Vui lòng tải lại trang."); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [user]);

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
              <h2>Choose a Template</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setOpenDrawer(false)}
              >
                &times;
              </button>
            </div>
            <div className={`${styles.drawerBody} ${styles.horizontalScroll}`}>
              {loading && <p role="status">Đang tải mẫu thiệp...</p>}
              {error && <p role="alert">{error}</p>}
              {!loading && !error && templates.length === 0 && <p>Chưa có mẫu thiệp. Bạn hãy quay lại sau khi Admin bổ sung mẫu nhé.</p>}
              {templates.map((template) => (
                <button
                  type="button"
                  disabled={creating}
                  key={template._id}
                  className={styles.templateCard}
                  onClick={() => handleChooseTemplate(template)}
                >
                  <img src={template.imgURL?.[0] || "/hpbd.png"} alt={template.name} />
                  <p>{template.name}</p>
                </button>
              ))}
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

