import { createElement, useRef, useState } from "react";
import {
  FaAlignCenter,
  FaAlignLeft,
  FaAlignRight,
  FaBold,
  FaClone,
  FaItalic,
  FaStrikethrough,
  FaTrash,
  FaUnderline,
  FaUpload,
} from "react-icons/fa";
import { PAGE_SIZE_PRESETS } from "../../utils/birthdayTemplates.js";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_ELEMENT_DIMENSION,
  MAX_FONT_SIZE,
  MIN_ELEMENT_DIMENSION,
  MIN_FONT_SIZE,
  SYSTEM_FONT_OPTIONS,
  uploadDesignImageFile,
} from "../../utils/domDesign.js";
import styles from "./EditPage.module.css";

function parseFiniteOrFallback(raw, fallback) {
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

export default function DomEditorInspector({
  doc,
  selectedElement,
  onUpdateElement,
  onDuplicateElement,
  onDeleteElement,
  onChangePageSize,
  onChangeBackground,
  onImageUploaded,
}) {
  const replaceImgRef = useRef(null);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState("");

  if (!selectedElement) {
    return (
      <aside className={styles.inspectorDrawer} aria-label="Thuộc tính trang">
        <div className={styles.panelContainer}>
          <div>
            <h3 className={styles.panelHeading}>Trang thiết kế</h3>
            <p className={styles.panelSubtext}>
              Chọn một phần tử trên thiệp để chỉnh sửa chi tiết, hoặc đổi kích thước và màu nền tại đây.
            </p>
          </div>

          <div className={styles.inspectorSection}>
            <span className={styles.panelSubtext}>
              Kích thước hiện tại: {doc?.width} × {doc?.height} px
            </span>
            <div className={styles.presetGrid}>
              {PAGE_SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`${styles.presetButton} ${
                    doc?.width === preset.width && doc?.height === preset.height
                      ? styles.presetButtonActive
                      : ""
                  }`}
                  onClick={() => onChangePageSize(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.colorRow}>
            <span>Màu nền thiệp</span>
            <input
              type="color"
              value={doc?.background || "#ffffff"}
              onChange={(e) => onChangeBackground(e.target.value)}
            />
          </label>
        </div>
      </aside>
    );
  }

  const patch = (changes, coalesceKey = null) => {
    onUpdateElement(selectedElement.id, changes, { coalesceKey });
  };

  const handleReplaceImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReplacing(true);
    setReplaceError("");
    try {
      const url = await uploadDesignImageFile(file);
      onImageUploaded?.(url);
      patch({ src: url });
    } catch (err) {
      setReplaceError(err?.message || "Không thể thay thế hình ảnh.");
    } finally {
      setReplacing(false);
    }
  };

  return (
    <aside className={styles.inspectorDrawer} aria-label="Thuộc tính phần tử">
      <div className={styles.panelContainer}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <h3 className={styles.panelHeading}>Thuộc tính</h3>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ padding: "5px 9px" }}
              onClick={() => onDuplicateElement(selectedElement.id)}
              title="Nhân đôi"
            >
              <FaClone />
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              style={{ padding: "5px 9px" }}
              onClick={() => onDeleteElement(selectedElement.id)}
              title="Xóa"
            >
              <FaTrash />
            </button>
          </div>
        </div>

        {selectedElement.type === "text" && (
          <div className={styles.inspectorSection}>
            <label className={styles.fieldLabel}>
              <span>Nội dung chữ</span>
              <textarea
                className={styles.fieldTextarea}
                value={selectedElement.text}
                onChange={(e) =>
                  patch({ text: e.target.value }, `text:${selectedElement.id}`)
                }
              />
            </label>

            <label className={styles.fieldLabel}>
              <span>Phông chữ hệ thống</span>
              <select
                className={styles.fieldSelect}
                value={selectedElement.fontFamily}
                onChange={(e) => patch({ fontFamily: e.target.value })}
              >
                {SYSTEM_FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.fieldGrid2}>
              <label className={styles.fieldLabel}>
                <span>Cỡ chữ (px)</span>
                <input
                  type="number"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  className={styles.fieldInput}
                  value={selectedElement.fontSize}
                  onChange={(e) =>
                    patch(
                      {
                        fontSize: Math.min(
                          MAX_FONT_SIZE,
                          Math.max(
                            MIN_FONT_SIZE,
                            parseFiniteOrFallback(e.target.value, selectedElement.fontSize)
                          )
                        ),
                      },
                      `fontSize:${selectedElement.id}`
                    )
                  }
                />
              </label>

              <label className={styles.fieldLabel}>
                <span>Màu chữ</span>
                <input
                  type="color"
                  className={styles.fieldInput}
                  style={{ height: "34px", padding: "2px" }}
                  value={selectedElement.color}
                  onChange={(e) =>
                    patch({ color: e.target.value }, `color:${selectedElement.id}`)
                  }
                />
              </label>
            </div>

            <div className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${
                  Number(selectedElement.fontWeight) >= 600 ||
                  selectedElement.fontWeight === "bold"
                    ? styles.toggleBtnActive
                    : ""
                }`}
                onClick={() =>
                  patch({
                    fontWeight:
                      Number(selectedElement.fontWeight) >= 600 ||
                      selectedElement.fontWeight === "bold"
                        ? "400"
                        : "700",
                  })
                }
                aria-label="In đậm"
                title="In đậm"
              >
                <FaBold />
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${
                  selectedElement.fontStyle === "italic" ? styles.toggleBtnActive : ""
                }`}
                onClick={() =>
                  patch({
                    fontStyle:
                      selectedElement.fontStyle === "italic" ? "normal" : "italic",
                  })
                }
                aria-label="In nghiêng"
                title="In nghiêng"
              >
                <FaItalic />
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${
                  selectedElement.textDecoration === "underline"
                    ? styles.toggleBtnActive
                    : ""
                }`}
                onClick={() =>
                  patch({
                    textDecoration:
                      selectedElement.textDecoration === "underline"
                        ? "none"
                        : "underline",
                  })
                }
                aria-label="Gạch chân"
                title="Gạch chân"
              >
                <FaUnderline />
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${
                  selectedElement.textDecoration === "line-through"
                    ? styles.toggleBtnActive
                    : ""
                }`}
                onClick={() =>
                  patch({
                    textDecoration:
                      selectedElement.textDecoration === "line-through"
                        ? "none"
                        : "line-through",
                  })
                }
                aria-label="Gạch ngang"
                title="Gạch ngang"
              >
                <FaStrikethrough />
              </button>
            </div>

            <div className={styles.toggleRow}>
              {[
                { value: "left", Icon: FaAlignLeft, label: "Căn trái" },
                { value: "center", Icon: FaAlignCenter, label: "Căn giữa" },
                { value: "right", Icon: FaAlignRight, label: "Căn phải" },
              ].map(({ value, Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.toggleBtn} ${
                    selectedElement.textAlign === value ? styles.toggleBtnActive : ""
                  }`}
                  onClick={() => patch({ textAlign: value })}
                  aria-label={label}
                  title={label}
                >
                  {createElement(Icon)}
                </button>
              ))}
            </div>

            <div className={styles.fieldGrid2}>
              <label className={styles.fieldLabel}>
                <span>Giãn dòng</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.6"
                  max="4"
                  className={styles.fieldInput}
                  value={selectedElement.lineHeight}
                  onChange={(e) =>
                    patch(
                      {
                        lineHeight: Math.max(
                          0.6,
                          parseFiniteOrFallback(e.target.value, selectedElement.lineHeight)
                        ),
                      },
                      `lineHeight:${selectedElement.id}`
                    )
                  }
                />
              </label>
              <label className={styles.fieldLabel}>
                <span>Giãn chữ (px)</span>
                <input
                  type="number"
                  step="0.5"
                  min="-10"
                  max="50"
                  className={styles.fieldInput}
                  value={selectedElement.letterSpacing}
                  onChange={(e) =>
                    patch(
                      {
                        letterSpacing: parseFiniteOrFallback(
                          e.target.value,
                          selectedElement.letterSpacing
                        ),
                      },
                      `letterSpacing:${selectedElement.id}`
                    )
                  }
                />
              </label>
            </div>
          </div>
        )}

        {selectedElement.type === "image" && (
          <div className={styles.inspectorSection}>
            <label className={styles.fieldLabel}>
              <span>Khung cắt ảnh</span>
              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${
                    selectedElement.objectFit === "cover" ? styles.toggleBtnActive : ""
                  }`}
                  onClick={() => patch({ objectFit: "cover" })}
                >
                  Lấp đầy (Cover)
                </button>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${
                    selectedElement.objectFit === "contain"
                      ? styles.toggleBtnActive
                      : ""
                  }`}
                  onClick={() => patch({ objectFit: "contain" })}
                >
                  Vừa khung (Contain)
                </button>
              </div>
            </label>

            <label className={styles.fieldLabel}>
              <span>Bo góc ảnh (px)</span>
              <input
                type="number"
                min="0"
                max="1000"
                className={styles.fieldInput}
                value={selectedElement.borderRadius}
                onChange={(e) =>
                  patch(
                    {
                      borderRadius: Math.max(
                        0,
                        parseFiniteOrFallback(
                          e.target.value,
                          selectedElement.borderRadius
                        )
                      ),
                    },
                    `radius:${selectedElement.id}`
                  )
                }
              />
            </label>

            <input
              ref={replaceImgRef}
              type="file"
              accept={ALLOWED_IMAGE_EXTENSIONS}
              className={styles.uploadInputHidden}
              onChange={handleReplaceImage}
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => replaceImgRef.current?.click()}
              disabled={replacing}
            >
              <FaUpload />
              {replacing ? "Đang tải..." : "Thay ảnh khác"}
            </button>
            {replaceError && (
              <p className={styles.uploadError} role="alert">
                {replaceError}
              </p>
            )}
          </div>
        )}

        {selectedElement.type === "shape" && (
          <div className={styles.inspectorSection}>
            <label className={styles.fieldLabel}>
              <span>Kiểu hình</span>
              <select
                className={styles.fieldSelect}
                value={selectedElement.shape}
                onChange={(e) => patch({ shape: e.target.value })}
              >
                <option value="rect">Hình chữ nhật</option>
                <option value="ellipse">Hình tròn / Elip</option>
                <option value="heart">Trái tim</option>
                <option value="star">Ngôi sao</option>
                <option value="triangle">Tam giác</option>
              </select>
            </label>

            <div className={styles.fieldGrid2}>
              <label className={styles.fieldLabel}>
                <span>Màu tô</span>
                <input
                  type="color"
                  className={styles.fieldInput}
                  style={{ height: "34px", padding: "2px" }}
                  value={
                    selectedElement.fill === "transparent"
                      ? "#ffffff"
                      : selectedElement.fill
                  }
                  onChange={(e) =>
                    patch({ fill: e.target.value }, `fill:${selectedElement.id}`)
                  }
                />
              </label>
              <label className={styles.fieldLabel}>
                <span>Màu viền</span>
                <input
                  type="color"
                  className={styles.fieldInput}
                  style={{ height: "34px", padding: "2px" }}
                  value={
                    selectedElement.stroke === "transparent" || !selectedElement.stroke
                      ? "#000000"
                      : selectedElement.stroke
                  }
                  onChange={(e) =>
                    patch({ stroke: e.target.value }, `stroke:${selectedElement.id}`)
                  }
                />
              </label>
            </div>

            <div className={styles.fieldGrid2}>
              <label className={styles.fieldLabel}>
                <span>Độ dày viền</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  className={styles.fieldInput}
                  value={selectedElement.strokeWidth}
                  onChange={(e) =>
                    patch(
                      {
                        strokeWidth: Math.max(
                          0,
                          parseFiniteOrFallback(
                            e.target.value,
                            selectedElement.strokeWidth
                          )
                        ),
                      },
                      `strokeW:${selectedElement.id}`
                    )
                  }
                />
              </label>

              {selectedElement.shape === "rect" && (
                <label className={styles.fieldLabel}>
                  <span>Bo góc (px)</span>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    className={styles.fieldInput}
                    value={selectedElement.borderRadius}
                    onChange={(e) =>
                      patch(
                        {
                          borderRadius: Math.max(
                            0,
                            parseFiniteOrFallback(
                              e.target.value,
                              selectedElement.borderRadius
                            )
                          ),
                        },
                        `radius:${selectedElement.id}`
                      )
                    }
                  />
                </label>
              )}
            </div>
          </div>
        )}

        <div className={styles.inspectorSection} style={{ borderBottom: "none" }}>
          <label className={styles.fieldLabel}>
            <span>
              Độ mờ ({Math.round((selectedElement.opacity ?? 1) * 100)}%)
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={selectedElement.opacity ?? 1}
              onChange={(e) =>
                patch(
                  { opacity: Number(e.target.value) },
                  `opacity:${selectedElement.id}`
                )
              }
            />
          </label>

          <div className={styles.fieldGrid2}>
            <label className={styles.fieldLabel}>
              <span>X (px)</span>
              <input
                type="number"
                className={styles.fieldInput}
                value={Math.round(selectedElement.x)}
                onChange={(e) =>
                  patch(
                    { x: parseFiniteOrFallback(e.target.value, selectedElement.x) },
                    `posX:${selectedElement.id}`
                  )
                }
              />
            </label>
            <label className={styles.fieldLabel}>
              <span>Y (px)</span>
              <input
                type="number"
                className={styles.fieldInput}
                value={Math.round(selectedElement.y)}
                onChange={(e) =>
                  patch(
                    { y: parseFiniteOrFallback(e.target.value, selectedElement.y) },
                    `posY:${selectedElement.id}`
                  )
                }
              />
            </label>
            <label className={styles.fieldLabel}>
              <span>Rộng (px)</span>
              <input
                type="number"
                min={MIN_ELEMENT_DIMENSION}
                max={MAX_ELEMENT_DIMENSION}
                className={styles.fieldInput}
                value={Math.round(selectedElement.width)}
                onChange={(e) =>
                  patch(
                    {
                      width: Math.min(
                        MAX_ELEMENT_DIMENSION,
                        Math.max(
                          MIN_ELEMENT_DIMENSION,
                          parseFiniteOrFallback(e.target.value, selectedElement.width)
                        )
                      ),
                    },
                    `dimW:${selectedElement.id}`
                  )
                }
              />
            </label>
            <label className={styles.fieldLabel}>
              <span>Cao (px)</span>
              <input
                type="number"
                min={MIN_ELEMENT_DIMENSION}
                max={MAX_ELEMENT_DIMENSION}
                className={styles.fieldInput}
                value={Math.round(selectedElement.height)}
                onChange={(e) =>
                  patch(
                    {
                      height: Math.min(
                        MAX_ELEMENT_DIMENSION,
                        Math.max(
                          MIN_ELEMENT_DIMENSION,
                          parseFiniteOrFallback(e.target.value, selectedElement.height)
                        )
                      ),
                    },
                    `dimH:${selectedElement.id}`
                  )
                }
              />
            </label>
          </div>

          <label className={styles.fieldLabel}>
            <span>Xoay (độ)</span>
            <input
              type="number"
              className={styles.fieldInput}
              value={Math.round(selectedElement.rotation || 0)}
              onChange={(e) =>
                patch(
                  {
                    rotation: parseFiniteOrFallback(
                      e.target.value,
                      selectedElement.rotation || 0
                    ),
                  },
                  `rot:${selectedElement.id}`
                )
              }
            />
          </label>
        </div>
      </div>
    </aside>
  );
}
