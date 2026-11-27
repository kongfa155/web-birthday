import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDesignJson,
  isDomDesign,
} from "../../services/designService.js";
import { createBlankDesign } from "../../utils/birthdayTemplates.js";
import DesignRenderer from "./DesignRenderer.jsx";
import { waitForDocumentAssets } from "../../utils/domDesign.js";
import styles from "./DomDesignViewer.module.css";

function computeFitScale(viewportEl, doc) {
  if (!viewportEl || !doc) return 1;
  const vw = Math.max(viewportEl.clientWidth, 1);
  const vh = Math.max(viewportEl.clientHeight, 1);
  const padding = Math.min(24, Math.min(vw, vh) * 0.05);
  const availW = Math.max(vw - padding * 2, 1);
  const availH = Math.max(vh - padding * 2, 1);
  return Math.min(
    availW / Math.max(doc.width, 1),
    availH / Math.max(doc.height, 1),
    1.5
  );
}

export default function DomDesignViewer({
  design,
  onReady,
  onError,
  className = "",
  style,
  backgroundColor = "#f1f5f9",
}) {
  const viewportRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  const [status, setStatus] = useState("loading");
  const [resolvedDoc, setResolvedDoc] = useState(null);
  const [scale, setScale] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setErrorMessage("");
    setStatus("loading");
    setRetryCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage("");
    setResolvedDoc(null);

    async function loadDesign() {
      // Allow React StrictMode initial unmount cleanup before running async I/O.
      await Promise.resolve();
      if (!active || controller.signal.aborted) return;

      const parsed = await fetchDesignJson(design, controller.signal);
      if (!active || controller.signal.aborted) return;

      const doc = parsed === null ? createBlankDesign() : parsed;
      if (!isDomDesign(doc)) {
        throw new Error("Dữ liệu thiết kế không thuộc định dạng DOM hợp lệ.");
      }

      setResolvedDoc(doc);
      setScale(computeFitScale(viewportRef.current, doc));
      await new Promise(requestAnimationFrame);
      if (!active || controller.signal.aborted) return;
      await waitForDocumentAssets(viewportRef.current);
      if (!active || controller.signal.aborted) return;
      setStatus("ready");
      onReadyRef.current?.(doc);
    }

    loadDesign().catch((err) => {
      if (!active || controller.signal.aborted || err?.name === "AbortError") {
        return;
      }
      const message =
        err?.message || "Không thể tải nội dung thiết kế thiệp. Vui lòng thử lại.";
      setErrorMessage(message);
      setStatus("error");
      onErrorRef.current?.(err);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [design, retryCount]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !resolvedDoc) return undefined;

    const updateScale = () => {
      setScale(computeFitScale(viewport, resolvedDoc));
    };
    updateScale();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(updateScale);
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [resolvedDoc]);

  return (
    <div
      className={`${styles.viewerRoot} ${className}`}
      style={{ background: backgroundColor, ...style }}
    >
      <div ref={viewportRef} className={styles.stageViewport}>
        {resolvedDoc && (
          <div
            className={styles.scaledFrame}
            style={{
              width: `${resolvedDoc.width * scale}px`,
              height: `${resolvedDoc.height * scale}px`,
            }}
          >
            <DesignRenderer
              design={resolvedDoc}
              editing={false}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        )}
      </div>

      {status === "loading" && (
        <div className={styles.overlay} role="status" aria-live="polite">
          <div className={styles.stateCard}>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.stateMessage} style={{ marginBottom: 0 }}>
              Đang tải bản xem trước thiệp...
            </p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className={styles.overlay} role="alert">
          <div className={styles.stateCard}>
            <h2 className={styles.stateTitle}>Không thể hiển thị thiệp</h2>
            <p className={styles.stateMessage}>{errorMessage}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={handleRetry}
            >
              Thử lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
