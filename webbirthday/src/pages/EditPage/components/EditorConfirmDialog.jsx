import styles from "../EditPage.module.css";

/**
 * Renders the editor confirmation dialog modal without extra wrapper DOM.
 */
export default function EditorConfirmDialog({ confirmState, onCancel }) {
  if (!confirmState) return null;

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className={styles.modalDialog}>
        <h3 id="confirm-modal-title" className={styles.modalTitle}>
          {confirmState.title}
        </h3>
        <p className={styles.modalText}>{confirmState.message}</p>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
          >
            Hủy
          </button>
          <button
            type="button"
            className={
              confirmState.danger ? styles.dangerButton : styles.primaryButton
            }
            onClick={confirmState.onConfirm}
          >
            {confirmState.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
