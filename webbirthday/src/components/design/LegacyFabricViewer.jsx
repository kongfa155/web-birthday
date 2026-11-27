import { useCallback, useEffect, useRef, useState } from "react";
import { StaticCanvas } from "fabric";
import {
  fetchDesignJson,
  isLegacyFabricDesign,
} from "../../services/designService.js";
import styles from "./LegacyFabricViewer.module.css";

function mergeBounds(acc, rect) {
  if (
    !rect ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    return acc;
  }
  const minX = rect.left;
  const minY = rect.top;
  const maxX = rect.left + Math.max(rect.width, 0);
  const maxY = rect.top + Math.max(rect.height, 0);
  if (!acc) return { minX, minY, maxX, maxY };
  return {
    minX: Math.min(acc.minX, minX),
    minY: Math.min(acc.minY, minY),
    maxX: Math.max(acc.maxX, maxX),
    maxY: Math.max(acc.maxY, maxY),
  };
}

function computeContentBounds(canvas, designJson) {
  let acc = null;

  for (const obj of canvas.getObjects()) {
    if (obj && obj.visible !== false) {
      obj.setCoords?.();
      acc = mergeBounds(acc, obj.getBoundingRect());
    }
  }

  for (const extra of [canvas.backgroundImage, canvas.overlayImage]) {
    if (extra && extra.visible !== false) {
      extra.setCoords?.();
      acc = mergeBounds(acc, extra.getBoundingRect());
    }
  }

  if (acc) {
    const width = acc.maxX - acc.minX;
    const height = acc.maxY - acc.minY;
    if (width >= 1 && height >= 1) {
      return { left: acc.minX, top: acc.minY, width, height };
    }
  }

  const fallbackWidth =
    Number(designJson?.width) > 0 ? Number(designJson.width) : 800;
  const fallbackHeight =
    Number(designJson?.height) > 0 ? Number(designJson.height) : 600;
  return { left: 0, top: 0, width: fallbackWidth, height: fallbackHeight };
}

function fitCanvasToStage(canvas, stageEl, designJson) {
  if (!canvas || !stageEl) return;
  const viewportWidth = Math.max(Math.floor(stageEl.clientWidth), 1);
  const viewportHeight = Math.max(Math.floor(stageEl.clientHeight), 1);
  const bounds = computeContentBounds(canvas, designJson);

  const padding = Math.min(24, Math.min(viewportWidth, viewportHeight) * 0.05);
  const availableWidth = Math.max(viewportWidth - padding * 2, 1);
  const availableHeight = Math.max(viewportHeight - padding * 2, 1);

  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
    2.5
  );

  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const translateX = viewportWidth / 2 - centerX * scale;
  const translateY = viewportHeight / 2 - centerY * scale;

  canvas.setDimensions({ width: viewportWidth, height: viewportHeight });
  canvas.setViewportTransform([scale, 0, 0, scale, translateX, translateY]);
  canvas.requestRenderAll();
}

export default function LegacyFabricViewer({
  source,
  title = "Thiệp định dạng cũ",
  onReady,
  onError,
  className = "",
  style,
}) {
  const stageRef = useRef(null);
  const canvasElRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  const [status, setStatus] = useState("loading");
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
    let staticCanvas = null;
    let resizeObserver = null;
    let onWindowResize = null;

    setStatus("loading");
    setErrorMessage("");

    async function loadLegacyDesign() {
      await Promise.resolve();
      if (!active || controller.signal.aborted) return;

      const designJson = await fetchDesignJson(source, controller.signal);
      if (!active || controller.signal.aborted) return;

      if (!designJson) {
        throw new Error("Thiệp định dạng cũ này không có dữ liệu thiết kế để hiển thị.");
      }

      if (!isLegacyFabricDesign(designJson)) {
        throw new Error("Dữ liệu thiệp không đúng định dạng Fabric hợp lệ.");
      }

      if (!canvasElRef.current || !stageRef.current) return;

      staticCanvas = new StaticCanvas(canvasElRef.current, {
        width: Math.max(stageRef.current.clientWidth, 300),
        height: Math.max(stageRef.current.clientHeight, 300),
        backgroundColor: "#ffffff",
        renderOnAddRemove: false,
      });

      await staticCanvas.loadFromJSON(
        designJson,
        (_serialized, _instance, err) => {
          if (err) throw err;
        },
        { signal: controller.signal }
      );
      if (!active || controller.signal.aborted) return;

      if (designJson.backgroundImage && !staticCanvas.backgroundImage) {
        throw new Error("Không thể tải ảnh nền của thiệp.");
      }
      if (designJson.overlayImage && !staticCanvas.overlayImage) {
        throw new Error("Không thể tải ảnh lớp phủ của thiệp.");
      }

      const fit = () => {
        if (active && staticCanvas && stageRef.current) {
          fitCanvasToStage(staticCanvas, stageRef.current, designJson);
        }
      };
      fit();

      if (typeof ResizeObserver === "function" && stageRef.current) {
        resizeObserver = new ResizeObserver(fit);
        resizeObserver.observe(stageRef.current);
      } else {
        onWindowResize = fit;
        window.addEventListener("resize", onWindowResize);
      }

      if (active && !controller.signal.aborted) {
        setStatus("ready");
        onReadyRef.current?.(staticCanvas);
      }
    }

    loadLegacyDesign().catch((err) => {
      if (!active || controller.signal.aborted || err?.name === "AbortError") {
        return;
      }
      const message =
        err?.message || "Không thể tải thiệp định dạng cũ. Vui lòng thử lại.";
      setErrorMessage(message);
      setStatus("error");
      onErrorRef.current?.(err);
    });

    return () => {
      active = false;
      controller.abort();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (onWindowResize) {
        window.removeEventListener("resize", onWindowResize);
        onWindowResize = null;
      }
      if (staticCanvas) {
        staticCanvas.dispose();
        staticCanvas = null;
      }
    };
  }, [source, retryCount]);

  return (
    <div className={`${styles.viewerRoot} ${className}`} style={style}>
      {status === "error" ? (
        <div className={styles.overlay} role="alert">
          <div className={styles.stateCard}>
            <h2 className={styles.stateTitle}>Không thể mở thiệp cũ</h2>
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
      ) : (
        <div ref={stageRef} className={styles.stage}>
          <canvas
            key={retryCount}
            ref={canvasElRef}
            className={styles.canvas}
            aria-label={title}
          />
          {status === "loading" && (
            <div className={styles.overlay} role="status" aria-live="polite">
              <div className={styles.stateCard}>
                <p className={styles.stateMessage} style={{ marginBottom: 0 }}>
                  Đang tải thiệp định dạng cũ...
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
