import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaRedo } from "react-icons/fa";
import { getCardById } from "../../services/cardService.js";
import { getTemplateById } from "../../services/templateService.js";
import {
  classifyRecordDesign,
  fetchDesignJson,
  isDomDesign,
} from "../../services/designService.js";
import DomDesignViewer from "../../components/design/DomDesignViewer.jsx";
import DomEditor from "./DomEditor.jsx";
import styles from "./EditPage.module.css";

export default function EditPage({ viewOnly = false, editorMode = "cards" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const mode = editorMode === "templates" ? "templates" : "cards";
  const backPath = mode === "templates" ? "/templates" : "/cards";

  const [loadState, setLoadState] = useState({
    status: "loading",
    recordId: null,
    editorKey: id,
    record: null,
    kind: "empty",
    designJson: null,
    errorMessage: "",
  });
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (id === "blank") {
      if (mode !== "templates" || viewOnly) {
        navigate("/cards", { replace: true });
        return;
      }
      setLoadState({
        status: "ready",
        recordId: "blank",
        editorKey: "blank",
        record: { name: "Mẫu thiệp mới" },
        kind: "dom-blank",
        designJson: null,
        errorMessage: "",
      });
      return;
    }

    let active = true;
    const controller = new AbortController();

    setLoadState({
      status: "loading",
      recordId: id,
      editorKey: id,
      record: null,
      kind: "empty",
      designJson: null,
      errorMessage: "",
    });

    async function fetchRecordAndDesign() {
      // Allow React StrictMode initial unmount cleanup before running async I/O.
      await Promise.resolve();
      if (!active || controller.signal.aborted) return;

      const res =
        mode === "cards"
          ? await getCardById(id)
          : await getTemplateById(id);

      if (!active || controller.signal.aborted) return;

      const record = res?.data;
      if (!record || typeof record !== "object") {
        throw new Error("Không tìm thấy dữ liệu thiết kế.");
      }

      const classified = classifyRecordDesign(record);

      if (classified.kind === "unsupported") {
        setLoadState({
          status: "ready",
          recordId: id,
          editorKey: id,
          record,
          kind: "unsupported",
          designJson: null,
          errorMessage:
            "Định dạng thiết kế này không được trình chỉnh sửa hiện tại hỗ trợ. Hệ thống không tự động chuyển đổi hoặc thay bằng trang trắng để tránh mất dữ liệu.",
        });
        return;
      }

      if (classified.kind === "dom") {
        const parsed = await fetchDesignJson(
          classified.source,
          controller.signal
        );
        if (!active || controller.signal.aborted) return;

        if (!isDomDesign(parsed)) {
          throw new Error(
            "Dữ liệu thiết kế không thuộc định dạng DOM hợp lệ."
          );
        }

        setLoadState({
          status: "ready",
          recordId: id,
          editorKey: id,
          record,
          kind: "dom",
          designJson: parsed,
          errorMessage: "",
        });
        return;
      }

      setLoadState({
        status: "ready",
        recordId: id,
        editorKey: id,
        record,
        kind: "empty",
        designJson: null,
        errorMessage: "",
      });
    }

    fetchRecordAndDesign().catch((err) => {
      if (!active || controller.signal.aborted || err?.name === "AbortError") {
        return;
      }
      setLoadState({
        status: "error",
        recordId: id,
        editorKey: id,
        record: null,
        kind: "empty",
        designJson: null,
        errorMessage:
          err?.response?.data?.message ||
          err?.message ||
          "Không thể tải dữ liệu thiết kế. Vui lòng thử lại.",
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, mode, viewOnly, navigate, retryCount]);

  if (loadState.status === "loading" || loadState.recordId !== id) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.stateScreen} role="status" aria-live="polite">
          <div className={styles.stateCard}>
            <div className={styles.spinner} aria-hidden="true" />
            <h2 className={styles.stateTitle}>Đang tải thiết kế...</h2>
            <p className={styles.stateBody} style={{ marginBottom: 0 }}>
              Vui lòng chờ trong giây lát.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className={styles.pageShell}>
        <div className={styles.stateScreen}>
          <div className={styles.stateCard} role="alert">
            <h2 className={styles.stateTitle}>Không thể tải thiết kế</h2>
            <p className={styles.stateBody}>{loadState.errorMessage}</p>
            <div className={styles.stateActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleRetry}
              >
                <FaRedo /> Thử lại
              </button>
              <Link to={backPath} className={styles.backButton}>
                <FaArrowLeft /> Quay lại
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const recordTitle =
    loadState.record?.cardName || loadState.record?.name || "Thiệp sinh nhật";

  if (loadState.kind === "unsupported") {
    return (
      <div className={styles.pageShell}>
        <div className={styles.stateScreen}>
          <div className={styles.stateCard} role="alert">
            <h2 className={styles.stateTitle}>Định dạng thiết kế không được hỗ trợ</h2>
            <p className={styles.stateBody}>{loadState.errorMessage}</p>
            <div className={styles.stateActions}>
              <Link to={backPath} className={styles.backButton}>
                <FaArrowLeft /> Quay lại
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewOnly) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.viewOnlyHeader}>
          <div className={styles.viewOnlyTitleGroup}>
            <Link to="/cards" className={styles.backButton}>
              <FaArrowLeft /> Quay lại
            </Link>
            <div>
              <h1 className={styles.viewOnlyTitle}>{recordTitle}</h1>
              {loadState.record?.cardDESC && (
                <p className={styles.viewOnlyDesc}>{loadState.record.cardDESC}</p>
              )}
            </div>
          </div>
          <span className={styles.readOnlyBadge}>Chế độ chỉ xem</span>
        </div>

        <div className={styles.editorArea}>
          <DomDesignViewer design={loadState.designJson} />
        </div>
      </div>
    );
  }

  return (
    <DomEditor
      key={loadState.editorKey}
      editorMode={mode}
      recordId={id}
      initialRecord={loadState.record}
      initialDesign={loadState.designJson}
      isNewBlank={id === "blank"}
    />
  );
}
