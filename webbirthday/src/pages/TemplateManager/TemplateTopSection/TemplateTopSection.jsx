import styles from "./TemplateTopSection.module.css";
import { useNavigate } from "react-router-dom";

export default function TemplateTopSection() {
  const navigate = useNavigate();
  return (
    <div className={styles.TemplateTopSection}>
      <div className={styles.containWrapper}>
        <div>
          <h1 className={styles.title}>TEMPLATES</h1>
          <button className={styles.pillBtn} onClick={() => navigate("/edit/templates/blank")}>
            + NEW
          </button>
        </div>
      </div>
    </div>
  );
}
