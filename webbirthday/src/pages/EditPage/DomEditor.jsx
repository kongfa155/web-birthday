import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaArrowLeft,
  FaDownload,
  FaRedo,
  FaSave,
  FaUndo,
} from "react-icons/fa";
import {
  createTemplate,
  updateTemplate,
} from "../../services/templateService.js";
import { updateCard } from "../../services/cardService.js";
import {
  cloneDesignJson,
  createBlankDesign,
  DEFAULT_PAGE_SIZE,
} from "../../utils/birthdayTemplates.js";
import {
  captureDesignPng,
  createDefaultElement,
  MAX_DESIGN_ELEMENTS,
  nextElementId,
  normalizeDomDesign,
  normalizeElement,
} from "../../utils/domDesign.js";
import DesignRenderer from "../../components/design/DesignRenderer.jsx";
import DomEditorSidebar from "./DomEditorSidebar.jsx";
import DomEditorInspector from "./DomEditorInspector.jsx";
import EditorTransformControls from "./components/EditorTransformControls.jsx";
import useEditorHistory from "./hooks/useEditorHistory.js";
import useEditorShortcuts from "./hooks/useEditorShortcuts.js";
import { computeFitZoom, sanitizeFileName } from "./editorHelpers.js";
import styles from "./EditPage.module.css";

export default function DomEditor({
  editorMode,
  recordId,
  initialRecord,
  initialDesign,
  isNewBlank,
}) {
  const navigate = useNavigate();
  const backPath = editorMode === "templates" ? "/templates" : "/cards";

  const initialName =
    initialRecord?.name ||
    initialRecord?.cardName ||
    (isNewBlank ? "Mẫu thiệp mới" : "");
  const initialDesc = initialRecord?.cardDESC || "";

  const initialDoc = useMemo(() => {
    const base = initialDesign
      ? cloneDesignJson(initialDesign)
      : createBlankDesign(DEFAULT_PAGE_SIZE);
    return normalizeDomDesign(base);
  }, [initialDesign]);

  const [activeRecordId, setActiveRecordId] = useState(recordId);
  const [hasSavedOnce, setHasSavedOnce] = useState(Boolean(initialDesign) && !isNewBlank);
  const [cardName, setCardName] = useState(initialName);
  const [cardDesc, setCardDesc] = useState(initialDesc);
  const [savedMeta, setSavedMeta] = useState({
    cardName: initialName,
    cardDesc: initialDesc,
  });

  const {
    doc,
    docRef,
    revision,
    revisionRef,
    canUndo,
    canRedo,
    commitDoc,
    undo,
    redo,
  } = useEditorHistory(initialDoc);
  const [savedRevision, setSavedRevision] = useState(0);

  const [activeTab, setActiveTab] = useState("templates");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);

  const [fitZoom, setFitZoom] = useState(0.5);
  const [manualZoom, setManualZoom] = useState(null);
  const zoom = manualZoom ?? fitZoom;

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmState, setConfirmState] = useState(null);

  const stageViewportRef = useRef(null);
  const planeRef = useRef(null);
  const moveableRef = useRef(null);
  const elementNodesRef = useRef(new Map());
  const interactionRef = useRef(null);

  const selectedElement = useMemo(
    () => doc.elements.find((el) => el.id === selectedId) || null,
    [doc.elements, selectedId]
  );

  const isDirty =
    !hasSavedOnce ||
    revision !== savedRevision ||
    cardName !== savedMeta.cardName ||
    (editorMode === "cards" && cardDesc !== savedMeta.cardDesc);

  const registerElementRef = useCallback((id, node) => {
    if (node) {
      elementNodesRef.current.set(id, node);
    } else {
      elementNodesRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedNode(null);
      return;
    }
    setSelectedNode(elementNodesRef.current.get(selectedId) || null);
  }, [selectedId, doc]);

  useEffect(() => {
    if (selectedId && !doc.elements.some((el) => el.id === selectedId)) {
      setSelectedId(null);
      setEditingTextId(null);
    }
  }, [doc.elements, selectedId]);

  useEffect(() => {
    const viewport = stageViewportRef.current;
    if (!viewport) return undefined;

    const update = () => {
      setFitZoom(computeFitZoom(viewport, docRef.current));
    };
    update();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(update);
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [doc.width, doc.height, docRef]);

  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [doc, selectedId, selectedNode, zoom]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleUndo = useCallback(() => {
    if (saving) return;
    setEditingTextId(null);
    undo();
  }, [saving, undo]);

  const handleRedo = useCallback(() => {
    if (saving) return;
    setEditingTextId(null);
    redo();
  }, [saving, redo]);

  const handleUpdateElement = useCallback(
    (id, changes, { coalesceKey = null } = {}) => {
      commitDoc(
        (prev) => ({
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === id ? normalizeElement({ ...el, ...changes }) : el
          ),
        }),
        { coalesceKey }
      );
    },
    [commitDoc]
  );

  const handleDeleteElement = useCallback(
    (id) => {
      if (!id || saving) return;
      setEditingTextId((cur) => (cur === id ? null : cur));
      setSelectedId((cur) => (cur === id ? null : cur));
      commitDoc((prev) => ({
        ...prev,
        elements: prev.elements.filter((el) => el.id !== id),
      }));
    },
    [commitDoc, saving]
  );

  const handleDuplicateElement = useCallback(
    (id) => {
      if (!id || saving) return;
      const source = docRef.current.elements.find((el) => el.id === id);
      if (!source) return;
      if (docRef.current.elements.length >= MAX_DESIGN_ELEMENTS) {
        toast.error(`Thiết kế tối đa ${MAX_DESIGN_ELEMENTS} phần tử.`);
        return;
      }
      const copy = normalizeElement({
        ...source,
        id: nextElementId(source.type),
        x: source.x + 28,
        y: source.y + 28,
      });
      commitDoc((prev) => ({
        ...prev,
        elements: [...prev.elements, copy],
      }));
      setSelectedId(copy.id);
      setEditingTextId(null);
    },
    [commitDoc, docRef, saving]
  );

  const handleMoveLayer = useCallback(
    (id, direction) => {
      if (!id || saving) return;
      commitDoc((prev) => {
        const idx = prev.elements.findIndex((el) => el.id === id);
        if (idx === -1) return prev;
        const targetIdx = direction === "up" ? idx + 1 : idx - 1;
        if (targetIdx < 0 || targetIdx >= prev.elements.length) return prev;
        const nextElements = [...prev.elements];
        const [item] = nextElements.splice(idx, 1);
        nextElements.splice(targetIdx, 0, item);
        return { ...prev, elements: nextElements };
      });
    },
    [commitDoc, saving]
  );

  const handleAddElement = useCallback(
    (element) => {
      if (saving) return;
      if (docRef.current.elements.length >= MAX_DESIGN_ELEMENTS) {
        toast.error(`Thiết kế tối đa ${MAX_DESIGN_ELEMENTS} phần tử.`);
        return;
      }
      commitDoc((prev) => ({
        ...prev,
        elements: [...prev.elements, element],
      }));
      setSelectedId(element.id);
      setEditingTextId(null);
    },
    [commitDoc, docRef, saving]
  );

  const handleAddText = useCallback(
    (variant) => {
      const current = docRef.current;
      const centerX = Math.round(current.width / 2);
      const centerY = Math.round(current.height / 2);

      const presets = {
        heading: {
          text: "Chúc Mừng Sinh Nhật!",
          fontSize: 72,
          fontWeight: "700",
          width: Math.min(760, current.width - 80),
          height: 150,
          color: "#be123c",
        },
        subheading: {
          text: "Gửi đến bạn lời chúc tốt đẹp nhất",
          fontSize: 42,
          fontWeight: "600",
          width: Math.min(680, current.width - 80),
          height: 110,
          color: "#1e293b",
        },
        body: {
          text: "Chúc bạn tuổi mới thật nhiều niềm vui, sức khỏe và thành công rực rỡ!",
          fontSize: 30,
          fontWeight: "400",
          width: Math.min(680, current.width - 80),
          height: 160,
          color: "#475569",
          lineHeight: 1.5,
        },
      };

      const chosen = presets[variant] || presets.body;
      const el = createDefaultElement("text", {
        ...chosen,
        x: Math.max(20, Math.round(centerX - chosen.width / 2)),
        y: Math.max(20, Math.round(centerY - chosen.height / 2)),
      });
      handleAddElement(el);
    },
    [docRef, handleAddElement]
  );

  const handleAddShape = useCallback(
    (shape) => {
      const current = docRef.current;
      const size = 220;
      const el = createDefaultElement("shape", {
        shape,
        width: size,
        height: size,
        x: Math.max(20, Math.round(current.width / 2 - size / 2)),
        y: Math.max(20, Math.round(current.height / 2 - size / 2)),
        fill: shape === "heart" ? "#f43f5e" : shape === "star" ? "#f59e0b" : "#38bdf8",
        borderRadius: shape === "rect" ? 20 : 0,
      });
      handleAddElement(el);
    },
    [docRef, handleAddElement]
  );

  const handleAddImage = useCallback(
    (url) => {
      if (!url) return;
      const current = docRef.current;
      const size = Math.min(460, Math.round(Math.min(current.width, current.height) * 0.45));
      const el = createDefaultElement("image", {
        src: url,
        width: size,
        height: size,
        x: Math.max(20, Math.round(current.width / 2 - size / 2)),
        y: Math.max(20, Math.round(current.height / 2 - size / 2)),
      });
      handleAddElement(el);
    },
    [docRef, handleAddElement]
  );

  const handleChangePageSize = useCallback(
    (preset) => {
      if (saving || !preset) return;
      commitDoc((prev) => ({
        ...prev,
        width: preset.width,
        height: preset.height,
      }));
      setManualZoom(null);
    },
    [commitDoc, saving]
  );

  const handleChangeBackground = useCallback(
    (color) => {
      if (saving || !color) return;
      commitDoc(
        (prev) => ({
          ...prev,
          background: color,
        }),
        { coalesceKey: "doc-background" }
      );
    },
    [commitDoc, saving]
  );

  const applyTemplateDesign = useCallback(
    (templateDesign) => {
      const cloned = normalizeDomDesign(cloneDesignJson(templateDesign));
      setSelectedId(null);
      setEditingTextId(null);
      setManualZoom(null);
      commitDoc(cloned);
    },
    [commitDoc]
  );

  const handleRequestApplyTemplate = useCallback(
    (tpl) => {
      if (saving) return;
      const hasElements = docRef.current.elements.length > 0;
      if (isDirty || hasElements) {
        setConfirmState({
          title: "Áp dụng mẫu thiệp mới?",
          message: `Áp dụng mẫu "${tpl.name}" sẽ thay thế toàn bộ bố cục hiện tại trên khung thiết kế.`,
          confirmLabel: "Áp dụng mẫu",
          onConfirm: () => {
            setConfirmState(null);
            applyTemplateDesign(tpl.design);
          },
        });
      } else {
        applyTemplateDesign(tpl.design);
      }
    },
    [saving, isDirty, applyTemplateDesign, docRef]
  );

  useEditorShortcuts({
    saving,
    confirmState,
    selectedId,
    editingTextId,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDelete: handleDeleteElement,
  });

  const handleBack = () => {
    if (saving) return;
    if (isDirty) {
      setConfirmState({
        title: "Rời khỏi trình chỉnh sửa?",
        message:
          "Bạn có thay đổi chưa được lưu. Nếu quay lại ngay, các chỉnh sửa chưa lưu sẽ bị mất.",
        confirmLabel: "Rời khỏi trang",
        danger: true,
        onConfirm: () => {
          setConfirmState(null);
          navigate(backPath);
        },
      });
      return;
    }
    navigate(backPath);
  };

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

  return (
    <div className={styles.pageShell}>
      <form className={styles.topBar} onSubmit={handleSaveSubmit}>
        <div className={styles.leftGroup}>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
            disabled={saving}
          >
            <FaArrowLeft />
            Quay lại
          </button>

          <input
            className={styles.metaInput}
            aria-label="Tên thiết kế"
            placeholder="Nhập tên thiết kế..."
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            maxLength={200}
            required
            disabled={saving}
          />

          {editorMode === "cards" && (
            <input
              className={`${styles.metaInput} ${styles.descInput}`}
              aria-label="Mô tả thiệp"
              placeholder="Mô tả thiệp (tùy chọn)"
              value={cardDesc}
              onChange={(e) => setCardDesc(e.target.value)}
              maxLength={500}
              disabled={saving}
            />
          )}

          <span
            className={`${styles.statusBadge} ${
              isDirty ? styles.statusDirty : styles.statusSaved
            }`}
          >
            {isDirty ? "Chưa lưu thay đổi" : "Đã lưu"}
          </span>
        </div>

        <div className={styles.rightGroup}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleUndo}
            disabled={saving || !canUndo}
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
          >
            <FaUndo />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleRedo}
            disabled={saving || !canRedo}
            title="Làm lại (Ctrl+Shift+Z)"
            aria-label="Làm lại"
          >
            <FaRedo />
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleDownloadPng}
            disabled={saving || downloading}
          >
            <FaDownload />
            {downloading ? "Đang xuất..." : "Tải PNG"}
          </button>

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={saving}
          >
            <FaSave />
            {saving ? "Đang lưu..." : "Lưu thiết kế"}
          </button>
        </div>
      </form>

      {actionError && (
        <div className={styles.editorErrorBanner} role="alert">
          <p className={styles.editorErrorText}>{actionError}</p>
          <div className={styles.editorErrorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ padding: "4px 10px" }}
              onClick={executeSave}
              disabled={saving}
            >
              Thử lưu lại
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ padding: "4px 10px" }}
              onClick={() => setActionError("")}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      <div className={styles.editorArea}>
        <fieldset disabled={saving} className={styles.editorFieldset}>
          <div className={styles.workspaceShell} data-has-selection={Boolean(selectedElement)}>
            <DomEditorSidebar
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                if (window.matchMedia("(max-width: 768px)").matches) {
                  setSelectedId(null);
                  setEditingTextId(null);
                }
              }}
              doc={doc}
              selectedId={selectedId}
              onSelectElement={(id) => {
                setSelectedId(id);
                setEditingTextId(null);
              }}
              onRequestApplyTemplate={handleRequestApplyTemplate}
              onChangePageSize={handleChangePageSize}
              onChangeBackground={handleChangeBackground}
              onAddText={handleAddText}
              onAddShape={handleAddShape}
              onAddImage={handleAddImage}
              onMoveLayer={handleMoveLayer}
              onDuplicateElement={handleDuplicateElement}
              onDeleteElement={handleDeleteElement}
              uploadedImages={uploadedImages}
              onImageUploaded={(url) =>
                setUploadedImages((prev) =>
                  prev.includes(url) ? prev : [url, ...prev]
                )
              }
            />

            <div className={styles.canvasColumn}>
              <div
                ref={stageViewportRef}
                className={styles.stageViewport}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedId(null);
                    setEditingTextId(null);
                  }
                }}
              >
                <div
                  className={styles.scaledWrapper}
                  style={{
                    width: `${doc.width * zoom}px`,
                    height: `${doc.height * zoom}px`,
                  }}
                >
                  <DesignRenderer
                    design={doc}
                    editing={!saving}
                    selectedId={selectedId}
                    editingTextId={editingTextId}
                    planeRef={planeRef}
                    registerElementRef={registerElementRef}
                    className={styles.designPlane}
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "top left",
                    }}
                    onSelect={(id) => {
                      if (saving) return;
                      if (id !== editingTextId) {
                        setEditingTextId(null);
                      }
                      setSelectedId(id);
                    }}
                    onTextDoubleClick={(id) => {
                      if (saving) return;
                      setSelectedId(id);
                      setEditingTextId(id);
                    }}
                    onTextChange={(id, nextText) => {
                      handleUpdateElement(
                        id,
                        { text: nextText },
                        { coalesceKey: `inline-text:${id}` }
                      );
                    }}
                    onTextBlur={(id, finalText) => {
                      setEditingTextId((cur) => (cur === id ? null : cur));
                      const currentEl = docRef.current.elements.find(
                        (item) => item.id === id
                      );
                      if (currentEl && currentEl.text !== finalText) {
                        handleUpdateElement(
                          id,
                          { text: finalText },
                          { coalesceKey: `inline-text:${id}` }
                        );
                      }
                    }}
                  />
                </div>
                  {!saving &&
                    selectedElement &&
                    selectedNode &&
                    editingTextId !== selectedElement.id && (
                      <EditorTransformControls
                        selectedElement={selectedElement}
                        selectedNode={selectedNode}
                        stageViewportRef={stageViewportRef}
                        moveableRef={moveableRef}
                        interactionRef={interactionRef}
                        onUpdateElement={handleUpdateElement}
                      />
                    )}
              </div>

              <div className={styles.zoomBar} aria-label="Thu phóng khung thiết kế">
                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={() =>
                    setManualZoom((prev) =>
                      Math.max(0.15, Math.round(((prev ?? fitZoom) - 0.1) * 100) / 100)
                    )
                  }
                  aria-label="Thu nhỏ"
                >
                  −
                </button>
                <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={() =>
                    setManualZoom((prev) =>
                      Math.min(2, Math.round(((prev ?? fitZoom) + 0.1) * 100) / 100)
                    )
                  }
                  aria-label="Phóng to"
                >
                  +
                </button>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={() => setManualZoom(null)}
                >
                  Vừa khung
                </button>
              </div>
            </div>

            <DomEditorInspector
              doc={doc}
              selectedElement={selectedElement}
              onUpdateElement={handleUpdateElement}
              onDuplicateElement={handleDuplicateElement}
              onDeleteElement={handleDeleteElement}
              onChangePageSize={handleChangePageSize}
              onChangeBackground={handleChangeBackground}
              onImageUploaded={(url) =>
                setUploadedImages((prev) =>
                  prev.includes(url) ? prev : [url, ...prev]
                )
              }
            />
          </div>
        </fieldset>

        {saving && (
          <div className={styles.savingOverlay} role="status" aria-live="polite">
            <div className={styles.stateCard}>
              <div className={styles.spinner} aria-hidden="true" />
              <p className={styles.stateBody} style={{ marginBottom: 0 }}>
                Đang tạo ảnh xem trước và lưu thiết kế...
              </p>
            </div>
          </div>
        )}
      </div>

      {confirmState && (
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
                onClick={() => setConfirmState(null)}
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
      )}
    </div>
  );
}
