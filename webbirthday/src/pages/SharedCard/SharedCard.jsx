import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { StaticCanvas } from "fabric";
import {
  fetchSharedDesignJson,
  getSharedCard,
} from "../../services/sharedCardService.js";
import styles from "./SharedCard.module.css";

function upsertHeadMeta(name, content) {
  let meta = document.head.querySelector(`meta[name="${name}"]`);
  const existed = Boolean(meta);
  const previousContent = existed ? meta.getAttribute("content") : null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);

  return () => {
    if (existed) {
      if (previousContent === null) meta.removeAttribute("content");
      else meta.setAttribute("content", previousContent);
    } else {
      meta.remove();
    }
  };
}

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

export default function SharedCard() {
  const { token } = useParams();
  const stageRef = useRef(null);
  const canvasElRef = useRef(null);

  const [status, setStatus] = useState("loading");
  const [cardInfo, setCardInfo] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useLayoutEffect(() => {
    const restoreRobots = upsertHeadMeta("robots", "noindex, nofollow");
    const restoreReferrer = upsertHeadMeta("referrer", "no-referrer");
    const previousTitle = document.title;
    document.title = "Xem thiệp chúc mừng sinh nhật";

    return () => {
      restoreReferrer();
      restoreRobots();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (cardInfo?.cardName) {
      document.title = `${cardInfo.cardName} — Thiệp sinh nhật`;
    }
  }, [cardInfo?.cardName]);

  const handleRetry = useCallback(() => {
    setStatus("loading");
    setErrorMessage("");
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
    setCardInfo(null);

    async function loadSharedCard() {
      // Allow React StrictMode's initial unmount cleanup before running I/O.
      await Promise.resolve();
      if (!active || controller.signal.aborted) return;

      const card = await getSharedCard(token, controller.signal);
      if (!active || controller.signal.aborted) return;

      setCardInfo({
        cardName: card.cardName || "Thiệp chúc mừng sinh nhật",
        cardDESC: typeof card.cardDESC === "string" ? card.cardDESC : "",
      });

      const designJson = await fetchSharedDesignJson(
        card.fabricEdit,
        controller.signal
      );
      if (!active || controller.signal.aborted) return;
      if (!canvasElRef.current || !stageRef.current) return;

      staticCanvas = new StaticCanvas(canvasElRef.current, {
        width: Math.max(stageRef.current.clientWidth, 300),
        height: Math.max(stageRef.current.clientHeight, 300),
        backgroundColor: "white",
        renderOnAddRemove: false,
      });

      if (designJson) {
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
      }
    }

    loadSharedCard().catch((err) => {
      if (!active || controller.signal.aborted) return;
      const message =
        err?.status === 404 || err?.status === 429
          ? err.message
          : "Không thể tải nội dung thiệp hoặc hình ảnh đính kèm. Vui lòng thử lại.";
      setErrorMessage(message);
      setStatus("error");
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
  }, [token, retryCount]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.badge}>Thiệp chia sẻ chỉ đọc</span>
          <h1 className={styles.title}>
            {cardInfo?.cardName || "Thiệp chúc mừng sinh nhật"}
          </h1>
          {cardInfo?.cardDESC && (
            <p className={styles.description}>{cardInfo.cardDESC}</p>
          )}
        </div>
      </header>

      <section className={styles.viewerSection} aria-label="Nội dung thiệp">
        {status === "error" ? (
          <div className={styles.stateCard} role="alert">
            <h2 className={styles.stateTitle}>Không thể mở thiệp</h2>
            <p className={styles.stateText}>{errorMessage}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={handleRetry}
            >
              Thử lại
            </button>
          </div>
        ) : (
          <div ref={stageRef} className={styles.canvasStage}>
            <canvas
              key={retryCount}
              ref={canvasElRef}
              className={styles.canvas}
              aria-label={cardInfo?.cardName || "Bản xem trước thiệp sinh nhật"}
            />
            {status === "loading" && (
              <div className={styles.loadingOverlay} role="status">
                <p className={styles.loadingText}>Đang tải thiệp...</p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
