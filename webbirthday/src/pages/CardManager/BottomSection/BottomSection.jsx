import { useState } from "react";
import styles from "./BottomSection.module.css";
import { getCards, deleteCard } from "../../../services/cardService";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import usePagedList from "../../../hooks/usePagedList";
import { useAuth } from "../../../context/AuthContext";
import ShareDialog from "../ShareDialog";

export default function BottomSection() {
  const [deleting, setDeleting] = useState(null);
  const [sharingCard, setSharingCard] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const { items: cards, setItems: setCards, loading, error, hasMore, loadMore, retry } = usePagedList(getCards, user?._id);

  async function remove(card) {
    if (deleting || !window.confirm(`Xóa thiệp “${card.cardName}”?`)) return;
    setDeleting(card._id);
    try {
      await deleteCard(card._id);
      setCards((prev) => prev.filter((item) => item._id !== card._id));
      toast.success("Đã xóa thiệp.");
    } catch {
      toast.error("Không thể xóa thiệp. Vui lòng thử lại.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className={styles.bottomSection}>
      <h2 className={styles.sectionTitle}>Thiệp của tôi</h2>
      {loading && cards.length === 0 ? <p role="status">Đang tải thiệp...</p> : cards.length === 0 && !error ? (
        <p className={styles.noCardsMessage}>Bạn chưa có thiệp nào. Nhấn “Tạo thiệp từ mẫu” ở phía trên để bắt đầu gửi lời chúc của mình nhé!</p>
      ) : (
        <div className={styles.gridContainer}>
          {cards.map((card) => (
            <article key={card._id} className={styles.rectCard}>
              <div className={styles.cardTop}>
                <img loading="lazy" decoding="async" src={card.imgURL?.[0] || "/hpbd.png"} alt={card.cardName} />
              </div>
              <div className={styles.divider} />
              <div className={styles.cardBottom}>
                <p><strong>{card.cardName}</strong></p>
                <p>{new Date(card.createdAt).toLocaleDateString("vi-VN")}</p>
                <button type="button" onClick={() => navigate(`/view/cards/${card._id}`)}>Xem</button>{" "}
                <button type="button" onClick={() => navigate(`/edit/cards/${card._id}`)}>Chỉnh sửa</button>{" "}
                <button type="button" disabled={!!deleting} onClick={() => setSharingCard(card)}>Chia sẻ</button>{" "}
                <button type="button" disabled={!!deleting} onClick={() => remove(card)}>{deleting === card._id ? "Đang xóa..." : "Xóa"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <p role="alert">Không thể tải thiệp. <button type="button" onClick={retry} disabled={loading}>Thử lại</button></p>}
      {hasMore && <button type="button" onClick={loadMore} disabled={loading}>{loading ? "Đang tải..." : "Xem thêm thiệp"}</button>}
      {sharingCard && <ShareDialog key={sharingCard._id} card={sharingCard} onClose={() => setSharingCard(null)} />}
    </div>
  );
}
