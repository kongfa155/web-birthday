import {
  FaArrowLeft,
  FaDownload,
  FaRedo,
  FaSave,
  FaUndo,
} from "react-icons/fa";
import styles from "../EditPage.module.css";

/**
 * Renders the top editor toolbar form with metadata inputs, history actions, export, and save.
 */
export default function EditorToolbar({
  editorMode,
  cardName,
  onCardNameChange,
  cardDesc,
  onCardDescChange,
  isDirty,
  saving,
  downloading,
  canUndo,
  canRedo,
  onBack,
  onUndo,
  onRedo,
  onDownloadPng,
  onSaveSubmit,
}) {
  return (
    <form className={styles.topBar} onSubmit={onSaveSubmit}>
      <div className={styles.leftGroup}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          disabled={saving}
        >
          <FaArrowLeft />
          Quay lại
        </button>

        <input
          className={styles.metaInput}
          aria-label="Tên thiết kế"
          placeholder="Nhập tên thiết kế..."
          value={cardName}
          onChange={(e) => onCardNameChange(e.target.value)}
          maxLength={200}
          required
          disabled={saving}
        />

        {editorMode === "cards" && (
          <input
            className={`${styles.metaInput} ${styles.descInput}`}
            aria-label="Mô tả thiệp"
            placeholder="Mô tả thiệp (tùy chọn)"
            value={cardDesc}
            onChange={(e) => onCardDescChange(e.target.value)}
            maxLength={500}
            disabled={saving}
          />
        )}

        <span
          className={`${styles.statusBadge} ${
            isDirty ? styles.statusDirty : styles.statusSaved
          }`}
        >
          {isDirty ? "Chưa lưu thay đổi" : "Đã lưu"}
        </span>
      </div>

      <div className={styles.rightGroup}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onUndo}
          disabled={saving || !canUndo}
          title="Hoàn tác (Ctrl+Z)"
          aria-label="Hoàn tác"
        >
          <FaUndo />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onRedo}
          disabled={saving || !canRedo}
          title="Làm lại (Ctrl+Shift+Z)"
          aria-label="Làm lại"
        >
          <FaRedo />
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onDownloadPng}
          disabled={saving || downloading}
        >
          <FaDownload />
          {downloading ? "Đang xuất..." : "Tải PNG"}
        </button>

        <button
          type="submit"
          className={styles.primaryButton}
          disabled={saving}
        >
          <FaSave />
          {saving ? "Đang lưu..." : "Lưu thiết kế"}
        </button>
      </div>
    </form>
  );
}
