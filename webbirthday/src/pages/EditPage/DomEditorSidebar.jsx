import { createElement, useRef, useState } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaClone,
  FaFont,
  FaHeart,
  FaImage,
  FaLayerGroup,
  FaPalette,
  FaPlus,
  FaRegCircle,
  FaRegSquare,
  FaShapes,
  FaStar,
  FaTrash,
  FaUpload,
} from "react-icons/fa";
import {
  BIRTHDAY_TEMPLATES,
  PAGE_SIZE_PRESETS,
} from "../../utils/birthdayTemplates.js";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  uploadDesignImageFile,
} from "../../utils/domDesign.js";
import styles from "./EditPage.module.css";

const BACKGROUND_SWATCHES = [
  "#ffffff",
  "#FFF8EE",
  "#FFF1F5",
  "#EFF6FF",
  "#ECFDF5",
  "#FEF3C7",
  "#F5F3FF",
  "#16213E",
  "#1E293B",
  "#0F172A",
];

const SHAPE_OPTIONS = [
  { shape: "rect", label: "Hình chữ nhật", Icon: FaRegSquare },
  { shape: "ellipse", label: "Hình tròn", Icon: FaRegCircle },
  { shape: "heart", label: "Trái tim", Icon: FaHeart },
  { shape: "star", label: "Ngôi sao", Icon: FaStar },
  { shape: "triangle", label: "Tam giác", Icon: FaShapes },
];

const SIDE_TABS = [
  { id: "templates", label: "Mẫu", Icon: FaPalette },
  { id: "text", label: "Chữ", Icon: FaFont },
  { id: "shapes", label: "Hình", Icon: FaShapes },
  { id: "upload", label: "Ảnh", Icon: FaImage },
  { id: "layers", label: "Lớp", Icon: FaLayerGroup },
];

function getLayerLabel(el, index) {
  if (el.type === "text") {
    const preview = (el.text || "").trim().replace(/\s+/g, " ");
    return preview ? `Chữ: ${preview}` : `Chữ #${index + 1}`;
  }
  if (el.type === "image") {
    return `Hình ảnh #${index + 1}`;
  }
  const shapeMap = {
    rect: "Hình chữ nhật",
    ellipse: "Hình tròn",
    heart: "Trái tim",
    star: "Ngôi sao",
    triangle: "Tam giác",
  };
  return shapeMap[el.shape] || `Hình khối #${index + 1}`;
}

export default function DomEditorSidebar({
  activeTab,
  onTabChange,
  doc,
  selectedId,
  onSelectElement,
  onRequestApplyTemplate,
  onChangePageSize,
  onChangeBackground,
  onAddText,
  onAddShape,
  onAddImage,
  onMoveLayer,
  onDuplicateElement,
  onDeleteElement,
  uploadedImages,
  onImageUploaded,
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadDesignImageFile(file);
      onImageUploaded?.(url);
      onAddImage?.(url);
    } catch (err) {
      setUploadError(err?.message || "Không thể tải ảnh lên. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  };

  const elements = Array.isArray(doc?.elements) ? doc.elements : [];
  const reversedLayers = [...elements]
    .map((el, index) => ({ el, index }))
    .reverse();

  return (
    <>
      <nav className={styles.sideRail} aria-label="Công cụ thiết kế">
        {SIDE_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.railTabBtn} ${
              activeTab === id ? styles.railTabBtnActive : ""
            }`}
            onClick={() => onTabChange(id)}
            aria-pressed={activeTab === id}
          >
            {createElement(Icon, { size: 16 })}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <aside className={styles.sideDrawer} aria-label="Bảng công cụ">
        {activeTab === "templates" && (
          <div className={styles.panelContainer}>
            <div>
              <h3 className={styles.panelHeading}>Mẫu thiệp sinh nhật</h3>
              <p className={styles.panelSubtext}>
                Chọn mẫu dựng sẵn để bắt đầu nhanh. Hệ thống sẽ hỏi xác nhận trước khi thay thế.
              </p>
            </div>

            <div className={styles.templateCardList}>
              {BIRTHDAY_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={styles.templateCard}
                  onClick={() => onRequestApplyTemplate(tpl)}
                >
                  <div className={styles.templateSwatches}>
                    {tpl.accentColors.map((color) => (
                      <span
                        key={color}
                        className={styles.templateSwatch}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className={styles.templateName}>{tpl.name}</span>
                  <span className={styles.templateMeta}>{tpl.subtitle}</span>
                </button>
              ))}
            </div>

            <div>
              <h4 className={styles.panelHeading} style={{ marginBottom: "8px" }}>
                Kích thước thiệp
              </h4>
              <div className={styles.presetGrid}>
                {PAGE_SIZE_PRESETS.map((preset) => {
                  const isCurrent =
                    doc?.width === preset.width && doc?.height === preset.height;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`${styles.presetButton} ${
                        isCurrent ? styles.presetButtonActive : ""
                      }`}
                      onClick={() => onChangePageSize(preset)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className={styles.panelHeading} style={{ marginBottom: "8px" }}>
                Màu nền thiệp
              </h4>
              <label className={styles.colorRow} style={{ marginBottom: "8px" }}>
                <span>Chọn màu tùy ý</span>
                <input
                  type="color"
                  value={doc?.background || "#ffffff"}
                  onChange={(e) => onChangeBackground(e.target.value)}
                  aria-label="Màu nền thiệp"
                />
              </label>
              <div className={styles.colorSwatchGrid}>
                {BACKGROUND_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={styles.colorSwatchBtn}
                    style={{ backgroundColor: color }}
                    onClick={() => onChangeBackground(color)}
                    title={color}
                    aria-label={`Chọn màu nền ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "text" && (
          <div className={styles.panelContainer}>
            <div>
              <h3 className={styles.panelHeading}>Thêm chữ viết</h3>
              <p className={styles.panelSubtext}>
                Nhấp đúp vào khung chữ trên thiệp hoặc sửa trực tiếp ở bảng thuộc tính bên phải.
              </p>
            </div>
            <div className={styles.presetGrid}>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => onAddText("heading")}
              >
                <FaPlus style={{ marginRight: "6px" }} />
                Thêm tiêu đề lớn
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => onAddText("subheading")}
              >
                <FaPlus style={{ marginRight: "6px" }} />
                Thêm tiêu đề phụ
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => onAddText("body")}
              >
                <FaPlus style={{ marginRight: "6px" }} />
                Thêm lời chúc
              </button>
            </div>
          </div>
        )}

        {activeTab === "shapes" && (
          <div className={styles.panelContainer}>
            <div>
              <h3 className={styles.panelHeading}>Hình khối trang trí</h3>
              <p className={styles.panelSubtext}>
                Thêm hình khối và tùy chỉnh màu sắc, viền ở bảng thuộc tính.
              </p>
            </div>
            <div className={styles.shapeGrid}>
              {SHAPE_OPTIONS.map(({ shape, label, Icon }) => (
                <button
                  key={shape}
                  type="button"
                  className={styles.shapeTile}
                  onClick={() => onAddShape(shape)}
                >
                  {createElement(Icon, { size: 20 })}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "upload" && (
          <div className={styles.panelContainer}>
            <div>
              <h3 className={styles.panelHeading}>Tải ảnh lên</h3>
              <p className={styles.panelSubtext}>
                Hỗ trợ PNG, JPG, WebP, GIF tối đa 5MB.
              </p>
            </div>

            <div className={styles.uploadBox}>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_IMAGE_EXTENSIONS}
                className={styles.uploadInputHidden}
                onChange={handleFileChange}
              />
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <FaUpload />
                {uploading ? "Đang tải lên..." : "Chọn ảnh từ thiết bị"}
              </button>
            </div>

            {uploadError && (
              <p className={styles.uploadError} role="alert">
                {uploadError}
              </p>
            )}

            {uploadedImages.length > 0 && (
              <div>
                <h4 className={styles.panelHeading} style={{ marginBottom: "8px" }}>
                  Ảnh đã tải trong phiên
                </h4>
                <div className={styles.uploadedGrid}>
                  {uploadedImages.map((url) => (
                    <button
                      key={url}
                      type="button"
                      className={styles.uploadedThumbBtn}
                      onClick={() => onAddImage(url)}
                      title="Chèn ảnh này vào thiệp"
                    >
                      <img src={url} alt="" className={styles.uploadedThumbImg} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "layers" && (
          <div className={styles.panelContainer}>
            <div>
              <h3 className={styles.panelHeading}>Danh sách lớp ({elements.length})</h3>
              <p className={styles.panelSubtext}>
                Lớp ở trên cùng hiển thị phía trước trên thiệp.
              </p>
            </div>

            {reversedLayers.length === 0 ? (
              <p className={styles.panelSubtext}>Chưa có phần tử nào trên thiệp.</p>
            ) : (
              <div className={styles.layerList}>
                {reversedLayers.map(({ el, index }) => {
                  const isSelected = el.id === selectedId;
                  const isTop = index === elements.length - 1;
                  const isBottom = index === 0;
                  return (
                    <div
                      key={el.id}
                      className={`${styles.layerItem} ${
                        isSelected ? styles.layerItemSelected : ""
                      }`}
                    >
                      <button
                        type="button"
                        className={styles.layerSelectBtn}
                        onClick={() => onSelectElement(el.id)}
                        title={getLayerLabel(el, index)}
                      >
                        {getLayerLabel(el, index)}
                      </button>
                      <div className={styles.layerActions}>
                        <button
                          type="button"
                          className={styles.miniIconBtn}
                          onClick={() => onMoveLayer(el.id, "up")}
                          disabled={isTop}
                          title="Đưa lên trên"
                          aria-label="Đưa lớp lên trên"
                        >
                          <FaArrowUp />
                        </button>
                        <button
                          type="button"
                          className={styles.miniIconBtn}
                          onClick={() => onMoveLayer(el.id, "down")}
                          disabled={isBottom}
                          title="Đưa xuống dưới"
                          aria-label="Đưa lớp xuống dưới"
                        >
                          <FaArrowDown />
                        </button>
                        <button
                          type="button"
                          className={styles.miniIconBtn}
                          onClick={() => onDuplicateElement(el.id)}
                          title="Nhân đôi"
                          aria-label="Nhân đôi phần tử"
                        >
                          <FaClone />
                        </button>
                        <button
                          type="button"
                          className={styles.miniIconBtn}
                          onClick={() => onDeleteElement(el.id)}
                          title="Xóa"
                          aria-label="Xóa phần tử"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
