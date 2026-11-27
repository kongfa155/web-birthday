import { useEffect, useState } from "react";
import styles from "./BottomSection.module.css";
import { getCards, deleteCard } from "../../../services/cardService";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "../../../context/AuthContext";

export default function BottomSection() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setCards([]);
    setLoading(true);
    setError("");
    getCards()
      .then((res) => { if (active) setCards(res.data); })
      .catch(() => { if (active) setError("Không thể tải thiệp. Vui lòng tải lại trang."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

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
      {loading ? <p role="status">Đang tải thiệp...</p> : error ? <p role="alert">{error}</p> : cards.length === 0 ? (
        <p className={styles.noCardsMessage}>Bạn chưa có thiệp nào. Nhấn “Tạo thiệp từ mẫu” ở phía trên để bắt đầu gửi lời chúc của mình nhé!</p>
      ) : (
        <div className={styles.gridContainer}>
          {cards.map((card) => (
            <article key={card._id} className={styles.rectCard}>
              <div className={styles.cardTop}>
                <img src={card.imgURL?.[0] || "/hpbd.png"} alt={card.cardName} />
              </div>
              <div className={styles.divider} />
              <div className={styles.cardBottom}>
                <p><strong>{card.cardName}</strong></p>
                <p>{new Date(card.createdAt).toLocaleDateString("vi-VN")}</p>
                <button type="button" onClick={() => navigate(`/view/cards/${card._id}`)}>Xem</button>{" "}
                <button type="button" onClick={() => navigate(`/edit/cards/${card._id}`)}>Chỉnh sửa</button>{" "}
                <button type="button" disabled={!!deleting} onClick={() => remove(card)}>{deleting === card._id ? "Đang xóa..." : "Xóa"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
