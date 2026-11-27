import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  createOrRotateCardShare,
  disableCardShare,
  getCardShareStatus,
} from "../../services/cardService.js";
import styles from "./ShareDialog.module.css";

export default function ShareDialog({ card, onClose }) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(null);
  const urlInputRef = useRef(null);
  const mountedRef = useRef(true);
  const activeAbortRef = useRef(null);
  const requestSeqRef = useRef(0);

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [mutating, setMutating] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState({ type: "", message: "" });

  const abortInFlight = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    requestSeqRef.current += 1;
    abortInFlight();
    setShareUrl("");
    setCopyFeedback({ type: "", message: "" });
    onClose();
  }, [abortInFlight, onClose]);

  const loadShareStatus = useCallback(async () => {
    abortInFlight();
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setLoadingStatus(true);
    setStatusError("");
    setActionError("");
    setActionMessage("");

    try {
      const response = await getCardShareStatus(card._id, controller.signal);
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      setShareEnabled(response.data?.shareEnabled === true);
    } catch (err) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        err?.code === "ERR_CANCELED" ||
        seq !== requestSeqRef.current
      ) {
        return;
      }
      setStatusError("Không thể kiểm tra trạng thái chia sẻ. Vui lòng thử lại.");
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setLoadingStatus(false);
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    }
  }, [abortInFlight, card._id]);

  useEffect(() => {
    mountedRef.current = true;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
    loadShareStatus();

    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
      abortInFlight();
      if (dialog?.open && typeof dialog.close === "function") {
        dialog.close();
      }
    };
  }, [abortInFlight, loadShareStatus]);

  async function handleCreateOrRotate() {
    if (mutating || loadingStatus) return;
    abortInFlight();
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setMutating(true);
    setShareUrl("");
    setActionError("");
    setActionMessage("");
    setCopyFeedback({ type: "", message: "" });

    try {
      const response = await createOrRotateCardShare(card._id, controller.signal);
      if (!mountedRef.current || seq !== requestSeqRef.current) return;

      const token = response.data?.shareToken;
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new Error("Invalid share token response");
      }

      const generatedUrl = `${window.location.origin}/share/${token}`;
      setShareEnabled(true);
      setShareUrl(generatedUrl);
      setActionMessage("Đã tạo liên kết chia sẻ mới. Hãy sao chép trước khi đóng hộp thoại.");
    } catch (err) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        err?.code === "ERR_CANCELED" ||
        seq !== requestSeqRef.current
      ) {
        return;
      }
      setActionError("Không thể tạo liên kết chia sẻ. Vui lòng thử lại.");
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setMutating(false);
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    }
  }

  async function handleDisable() {
    if (mutating || loadingStatus) return;
    abortInFlight();
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setMutating(true);
    setActionError("");
    setActionMessage("");
    setCopyFeedback({ type: "", message: "" });

    try {
      await disableCardShare(card._id, controller.signal);
      if (!mountedRef.current || seq !== requestSeqRef.current) return;

      setShareEnabled(false);
      setShareUrl("");
      setActionMessage("Đã tắt chia sẻ. Liên kết trước đó không còn truy cập được.");
    } catch (err) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        err?.code === "ERR_CANCELED" ||
        seq !== requestSeqRef.current
      ) {
        return;
      }
      setActionError("Không thể tắt chia sẻ. Vui lòng thử lại.");
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setMutating(false);
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    }
  }

  async function handleCopy() {
    if (!shareUrl || mutating || loadingStatus) return;
    setCopyFeedback({ type: "", message: "" });

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(shareUrl);
      if (!mountedRef.current) return;
      setCopyFeedback({
        type: "success",
        message: "Đã sao chép liên kết vào bộ nhớ tạm.",
      });
    } catch {
      if (!mountedRef.current) return;
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
      setCopyFeedback({
        type: "error",
        message:
          "Trình duyệt không cho phép sao chép tự động. Đường dẫn đã được bôi đen — hãy nhấn Ctrl+C (hoặc Cmd+C) để sao chép thủ công.",
      });
    }
  }

  const busy = loadingStatus || mutating;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          handleClose();
        }
      }}
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.title}>
              Chia sẻ thiệp
            </h2>
            <p className={styles.subtitle}>{card.cardName}</p>
          </div>
          <button
            type="button"
            className={styles.closeIconButton}
            onClick={handleClose}
            aria-label="Đóng hộp thoại chia sẻ"
          >
            &times;
          </button>
        </div>

        <p id={descId} className={styles.notice}>
          Bất kỳ ai có liên kết (bao gồm người được chuyển tiếp) đều có thể xem
          phiên bản đã lưu mới nhất của thiệp ở chế độ chỉ đọc mà không cần đăng nhập.
        </p>

        {loadingStatus ? (
          <p className={styles.statusInfo} role="status">
            Đang tải trạng thái chia sẻ...
          </p>
        ) : statusError ? (
          <div className={styles.errorBox} role="alert">
            <p className={styles.errorText}>{statusError}</p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={loadShareStatus}
            >
              Thử lại
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.statusRow}>
              <span>Trạng thái hiện tại:</span>
              <span
                className={
                  shareEnabled ? styles.badgeEnabled : styles.badgeDisabled
                }
              >
                {shareEnabled ? "Đang bật chia sẻ" : "Đang tắt chia sẻ"}
              </span>
            </div>

            {shareEnabled && shareUrl && (
              <div className={styles.urlBlock}>
                <label htmlFor={`${titleId}-url`} className={styles.urlLabel}>
                  Liên kết chia sẻ công khai (chỉ hiển thị trong phiên mở này):
                </label>
                <div className={styles.urlRow}>
                  <input
                    id={`${titleId}-url`}
                    ref={urlInputRef}
                    type="text"
                    readOnly
                    value={shareUrl}
                    className={styles.urlInput}
                    onFocus={(event) => event.target.select()}
                    onClick={(event) => event.target.select()}
                  />
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleCopy}
                    disabled={busy}
                  >
                    Sao chép liên kết
                  </button>
                </div>
                {copyFeedback.message && (
                  <p
                    className={
                      copyFeedback.type === "success"
                        ? styles.successText
                        : styles.errorText
                    }
                    role={copyFeedback.type === "success" ? "status" : "alert"}
                  >
                    {copyFeedback.message}
                  </p>
                )}
              </div>
            )}

            {shareEnabled && !shareUrl && (
              <p className={styles.mutedInfo}>
                Thiệp đang bật chia sẻ. Vì lý do bảo mật, đường dẫn đầy đủ chỉ
                hiển thị một lần khi tạo và không thể xem lại sau khi đóng hộp thoại.
              </p>
            )}

            {shareEnabled && (
              <p className={styles.warningBox}>
                Cảnh báo: Khi bấm “Tạo liên kết mới”, liên kết chia sẻ cũ sẽ bị
                thu hồi ngay lập tức và không còn sử dụng được nữa.
              </p>
            )}

            {actionMessage && (
              <p className={styles.successText} role="status">
                {actionMessage}
              </p>
            )}
            {actionError && (
              <p className={styles.errorText} role="alert">
                {actionError}
              </p>
            )}

            <div className={styles.actions}>
              {!shareEnabled ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleCreateOrRotate}
                  disabled={busy}
                >
                  {mutating ? "Đang tạo..." : "Tạo liên kết chia sẻ"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleCreateOrRotate}
                    disabled={busy}
                  >
                    {mutating ? "Đang xử lý..." : "Tạo liên kết mới"}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={handleDisable}
                    disabled={busy}
                  >
                    {mutating ? "Đang xử lý..." : "Tắt chia sẻ"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <p className={styles.limitation}>
          Lưu ý giới hạn thu hồi Cloudinary: Việc tắt chia sẻ hoặc đổi liên kết
          sẽ chặn ngay API và đường dẫn chia sẻ, nhưng các tệp ảnh hoặc JSON đã
          tải lên Cloudinary vẫn có thể truy cập trực tiếp nếu người nhận đã
          lưu sẵn URL CDN trước đó.
        </p>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </dialog>
  );
}
