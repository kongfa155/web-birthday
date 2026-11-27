import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  createTemplate,
  updateTemplate,
} from "../../../services/templateService.js";
import { updateCard } from "../../../services/cardService.js";
import {
  captureDesignPng,
  normalizeDomDesign,
} from "../../../utils/domDesign.js";
import { sanitizeFileName } from "../editorHelpers.js";

/**
 * Manages card/template metadata, dirty tracking, save persistence, and PNG export.
 */
export default function useEditorPersistence({
  editorMode,
  recordId,
  initialRecord,
  initialDesign,
  isNewBlank,
  docRef,
  revisionRef,
  revision,
  planeRef,
  setEditingTextId,
}) {
  const navigate = useNavigate();

  const initialName =
    initialRecord?.name ||
    initialRecord?.cardName ||
    (isNewBlank ? "Mẫu thiệp mới" : "");
  const initialDesc = initialRecord?.cardDESC || "";

  const [activeRecordId, setActiveRecordId] = useState(recordId);
  const [hasSavedOnce, setHasSavedOnce] = useState(
    Boolean(initialDesign) && !isNewBlank
  );
  const [cardName, setCardName] = useState(initialName);
  const [cardDesc, setCardDesc] = useState(initialDesc);
  const [savedMeta, setSavedMeta] = useState({
    cardName: initialName,
    cardDesc: initialDesc,
  });
  const [savedRevision, setSavedRevision] = useState(0);

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState("");

  const isDirty =
    !hasSavedOnce ||
    revision !== savedRevision ||
    cardName !== savedMeta.cardName ||
    (editorMode === "cards" && cardDesc !== savedMeta.cardDesc);

  const handleDownloadPng = async () => {
    if (saving || downloading) return;
    setEditingTextId(null);
    setActionError("");
    setDownloading(true);
    try {
      await new Promise(requestAnimationFrame);
      const current = docRef.current;
      const dataUrl = await captureDesignPng(planeRef.current, {
        width: current.width,
        height: current.height,
        pixelRatio: 2,
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${sanitizeFileName(cardName)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      const message =
        err?.message || "Không thể xuất ảnh PNG. Vui lòng thử lại.";
      setActionError(message);
      toast.error(message);
    } finally {
      setDownloading(false);
    }
  };

  const executeSave = async () => {
    const trimmedName = cardName.trim();
    if (!trimmedName) {
      const msg = "Vui lòng nhập tên thiết kế.";
      setActionError(msg);
      toast.error(msg);
      return;
    }
    if (saving) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setEditingTextId(null);
    setActionError("");
    setSaving(true);

    try {
      // Flush pending inline text blur commit before reading revision/doc.
      await new Promise(requestAnimationFrame);

      const savingRevision = revisionRef.current;
      const savingMeta = { cardName: trimmedName, cardDesc };
      const cleanDesign = normalizeDomDesign(docRef.current);

      const preview = await captureDesignPng(planeRef.current, {
        width: cleanDesign.width,
        height: cleanDesign.height,
        pixelRatio: 0.25,
      });

      if (editorMode === "templates") {
        const payload = {
          name: trimmedName,
          design: cleanDesign,
          preview,
        };

        if (activeRecordId === "blank") {
          const res = await createTemplate(payload);
          const createdTemplate = res?.data?.template || res?.data;
          const createdId = createdTemplate?._id || createdTemplate?.id;

          if (!createdId) {
            throw new Error("Máy chủ không trả về mã mẫu thiệp vừa tạo.");
          }

          setActiveRecordId(createdId);
          setHasSavedOnce(true);
          setCardName(trimmedName);
          setSavedMeta(savingMeta);
          setSavedRevision(savingRevision);
          toast.success("Đã tạo và lưu mẫu thiệp.");

          navigate(`/edit/templates/${encodeURIComponent(createdId)}`, {
            replace: true,
          });
        } else {
          await updateTemplate(activeRecordId, payload);
          setHasSavedOnce(true);
          setCardName(trimmedName);
          setSavedMeta(savingMeta);
          setSavedRevision(savingRevision);
          toast.success("Đã lưu mẫu thiệp.");
        }
      } else {
        await updateCard(activeRecordId, {
          cardName: trimmedName,
          cardDESC: cardDesc,
          design: cleanDesign,
          preview,
        });
        setHasSavedOnce(true);
        setCardName(trimmedName);
        setSavedMeta(savingMeta);
        setSavedRevision(savingRevision);
        toast.success("Đã lưu thiết kế thiệp.");
      }
    } catch (err) {
      console.error(err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Không thể lưu thiết kế. Vui lòng thử lại.";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubmit = (event) => {
    event.preventDefault();
    executeSave();
  };

  return {
    cardName,
    setCardName,
    cardDesc,
    setCardDesc,
    saving,
    downloading,
    actionError,
    setActionError,
    isDirty,
    handleDownloadPng,
    executeSave,
    handleSaveSubmit,
  };
}
