import React, { useEffect, useState } from "react";
import styles from "./TemplateTopSection.module.css";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { getTemplates } from "../../../services/templateService";

const TemplateTopSection = () => {
  const [openDrawer, setOpenDrawer] = useState(false);
  const [templates, setTemplates] = useState([]);
  const navigate = useNavigate();

  // Lấy danh sách template từ backend bằng getTemplates service (đã gắn token)
  useEffect(() => {
    let active = true;

    const fetchTemplates = async () => {
      try {
        const res = await getTemplates();
        if (active) {
          setTemplates(Array.isArray(res.data) ? res.data : []);
        }
      } catch (err) {
        if (active) {
          toast.error("Không thể lấy danh sách template");
          console.error(err);
        }
      }
    };

    fetchTemplates();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={styles.TemplateTopSection}>
      <div className={styles.containWrapper}>
        <div>
          <h1 className={styles.title}>TEMPLATES</h1>
          <button
            className={styles.pillBtn}
            onClick={() => navigate("/edit/templates/blank")}
          >
            + NEW
          </button>
        </div>
      </div>

      {/* Drawer */}
      <div
        className={`${styles.drawer} ${openDrawer ? styles.drawerOpen : ""}`}
      >
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
          {templates.map((template) => (
            <div
              key={template._id}
              className={styles.templateCard}
              onClick={() => {
                setOpenDrawer(false);
                navigate(`/cards/new?template=${template._id}`); // link đến page tạo card mới từ template
              }}
            >
              <img
                src={
                  template.imgURL?.[0] ||
                  "https://via.placeholder.com/200x120?text=Template"
                }
                alt={template.name}
              />
              <p>{template.name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Overlay */}
      {openDrawer && (
        <div
          className={styles.drawerOverlay}
          onClick={() => setOpenDrawer(false)}
        ></div>
      )}
    </div>
  );
};

export default TemplateTopSection;
