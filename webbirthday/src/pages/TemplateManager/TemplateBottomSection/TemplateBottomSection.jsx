import { Link } from "react-router-dom";
import styles from "./TemplateBottomSection.module.css";
import { getTemplates } from "../../../services/templateService";
import usePagedList from "../../../hooks/usePagedList";
import { useAuth } from "../../../context/AuthContext";

const TemplateBottomSection = () => {
  const { user } = useAuth();
  const { items: templates, loading, error, hasMore, loadMore, retry } = usePagedList(getTemplates, user?._id);

  return (
    <div className={styles.bottomSection}>
      <h2 className={styles.sectionTitle}>All Templates</h2>
      {loading && <p role="status">Đang tải mẫu thiệp...</p>}
      {!loading && !error && templates.length === 0 && <p>Chưa có mẫu thiệp nào.</p>}
      <div className={styles.gridContainer}>
        {templates.map((template) => (
          <Link
            key={template._id}
            to={`/edit/templates/${template._id}`} // 👈 dùng Link thay navigate
            className={styles.rectCard}
          >
            <div className={styles.cardTop}>
              <img loading="lazy" decoding="async"
                src={
                  template.imgURL?.[0] ||
                  "/hpbd.png"
                }
                alt={template.name}
              />
            </div>
            <div className={styles.divider}></div>
            <div className={styles.cardBottom}>
              <p>
                <strong>{template.name}</strong>
              </p>
              <p>{new Date(template.createdAt).toLocaleDateString()}</p>
              <p>{template.owner?.username || "Unknown"}</p>
            </div>
          </Link>
        ))}
      </div>
      {error && <p role="alert">Không thể tải mẫu thiệp. <button type="button" onClick={retry} disabled={loading}>Thử lại</button></p>}
      {hasMore && <button type="button" onClick={loadMore} disabled={loading}>{loading ? "Đang tải..." : "Xem thêm mẫu"}</button>}
    </div>
  );
};

export default TemplateBottomSection;
 