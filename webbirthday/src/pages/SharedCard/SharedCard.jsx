import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSharedCard } from "../../services/sharedCardService.js";
import { classifyRecordDesign } from "../../services/designService.js";
import styles from "./SharedCard.module.css";

const DomDesignViewer = lazy(() => import("../../components/design/DomDesignViewer.jsx"));
const LegacyFabricViewer = lazy(() => import("../../components/design/LegacyFabricViewer.jsx"));

function upsertHeadMeta(name, content) {
  let meta = document.head.querySelector(`meta[name="${name}"]`);
  const existed = Boolean(meta);
  const previousContent = meta?.getAttribute("content");
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
  return () => {
    if (!existed) meta.remove();
    else if (previousContent === null) meta.removeAttribute("content");
    else meta.setAttribute("content", previousContent);
  };
}

export default function SharedCard() {
  const { token } = useParams();
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const card = result?.token === token ? result.card : null;

  useLayoutEffect(() => {
    const robots = upsertHeadMeta("robots", "noindex, nofollow");
    const referrer = upsertHeadMeta("referrer", "no-referrer");
    const title = document.title;
    document.title = "Xem thiệp chúc mừng sinh nhật";
    return () => { robots(); referrer(); document.title = title; };
  }, []);

  useEffect(() => {
    if (card?.cardName) document.title = `${card.cardName} — Thiệp sinh nhật`;
  }, [card?.cardName]);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setErrorMessage("");
    getSharedCard(token, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ token, card: data });
    }).catch((error) => {
      if (!controller.signal.aborted) setErrorMessage(error.message || "Không thể tải thiệp. Vui lòng thử lại.");
    });
    return () => controller.abort();
  }, [token, retry]);

  const design = classifyRecordDesign(card);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.badge}>Thiệp chia sẻ chỉ đọc</span>
          <h1 className={styles.title}>{card?.cardName || "Thiệp chúc mừng sinh nhật"}</h1>
          {card?.cardDESC && <p className={styles.description}>{card.cardDESC}</p>}
        </div>
      </header>
      <section className={styles.viewerSection} aria-label="Nội dung thiệp">
        {errorMessage ? (
          <div className={styles.stateCard} role="alert">
            <h2 className={styles.stateTitle}>Không thể mở thiệp</h2>
            <p className={styles.stateText}>{errorMessage}</p>
            <button className={styles.retryButton} onClick={() => setRetry((n) => n + 1)}>Thử lại</button>
          </div>
        ) : !card ? <p role="status">Đang tải thiệp...</p> : (
          <div className={styles.canvasStage}>
            <Suspense fallback={<p role="status">Đang tải bản xem trước...</p>}>
              {design.kind === "dom" ? (
                <DomDesignViewer key={token} design={design.source} style={{ height: "100%", minHeight: "68vh" }} />
              ) : design.kind === "legacy-fabric" ? (
                <LegacyFabricViewer key={token} source={design.source} title={card.cardName} style={{ height: "100%", minHeight: "68vh" }} />
              ) : design.kind === "unsupported" ? <p role="alert" className={styles.stateCard}>Định dạng thiết kế chưa được hỗ trợ.</p>
                : <p className={styles.stateCard}>Thiệp chưa có nội dung thiết kế.</p>}
            </Suspense>
          </div>
        )}
      </section>
    </main>
  );
}
