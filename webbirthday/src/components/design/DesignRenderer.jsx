import { useEffect, useRef } from "react";

const SHAPE_VECTOR_PATHS = {
  triangle: {
    tag: "polygon",
    points: "50,6 95,92 5,92",
  },
  star: {
    tag: "polygon",
    points:
      "50,4 63,35 96,38 71,60 79,94 50,76 21,94 29,60 4,38 37,35",
  },
  heart: {
    tag: "path",
    d: "M50,88 C50,88 8,62 8,33 C8,16 21,6 34,6 C43,6 48,12 50,17 C52,12 57,6 66,6 C79,6 92,16 92,33 C92,62 50,88 50,88 Z",
  },
};

function InlineEditableText({ element, onTextChange, onTextBlur }) {
  const ref = useRef(null);
  const initialTextRef = useRef(element.text);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.textContent = initialTextRef.current ?? "";
    node.focus();

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [element.id]);

  const handlePaste = (event) => {
    event.preventDefault();
    const plainText = event.clipboardData?.getData("text/plain") ?? "";
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(plainText);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    onTextChange?.(element.id, ref.current?.textContent ?? "");
  };

  const handleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Chỉnh sửa nội dung chữ"
      onInput={(e) => onTextChange?.(element.id, e.currentTarget.textContent ?? "")}
      onBlur={(e) => onTextBlur?.(element.id, e.currentTarget.textContent ?? "")}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        height: "100%",
        outline: "2px dashed #2563eb",
        outlineOffset: "2px",
        cursor: "text",
        fontFamily: element.fontFamily,
        fontSize: `${element.fontSize}px`,
        fontWeight: element.fontWeight,
        fontStyle: element.fontStyle,
        textDecoration: element.textDecoration,
        textAlign: element.textAlign,
        color: element.color,
        lineHeight: element.lineHeight,
        letterSpacing: `${element.letterSpacing}px`,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        boxSizing: "border-box",
      }}
    />
  );
}

function renderTextElement(el, { editing, editingTextId, onTextChange, onTextBlur }) {
  if (editing && editingTextId === el.id) {
    return (
      <InlineEditableText
        element={el}
        onTextChange={onTextChange}
        onTextBlur={onTextBlur}
      />
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        fontFamily: el.fontFamily,
        fontSize: `${el.fontSize}px`,
        fontWeight: el.fontWeight,
        fontStyle: el.fontStyle,
        textDecoration: el.textDecoration,
        textAlign: el.textAlign,
        color: el.color,
        lineHeight: el.lineHeight,
        letterSpacing: `${el.letterSpacing}px`,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {el.text}
    </div>
  );
}

function renderImageElement(el) {
  const isDataUrl = typeof el.src === "string" && el.src.startsWith("data:");
  return (
    <img
      src={el.src}
      alt=""
      draggable={false}
      crossOrigin={isDataUrl ? undefined : "anonymous"}
      referrerPolicy="no-referrer"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: el.objectFit === "contain" ? "contain" : "cover",
        borderRadius: `${el.borderRadius || 0}px`,
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
}

function renderShapeElement(el) {
  const hasStroke = Number(el.strokeWidth) > 0 && el.stroke && el.stroke !== "transparent";

  if (el.shape === "rect" || el.shape === "ellipse") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: el.fill,
          border: hasStroke ? `${el.strokeWidth}px solid ${el.stroke}` : "none",
          borderRadius: el.shape === "ellipse" ? "50%" : `${el.borderRadius || 0}px`,
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />
    );
  }

  const vector = SHAPE_VECTOR_PATHS[el.shape];
  if (!vector) {
    return null;
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {vector.tag === "polygon" ? (
        <polygon
          points={vector.points}
          fill={el.fill}
          stroke={hasStroke ? el.stroke : "none"}
          strokeWidth={hasStroke ? el.strokeWidth : 0}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <path
          d={vector.d}
          fill={el.fill}
          stroke={hasStroke ? el.stroke : "none"}
          strokeWidth={hasStroke ? el.strokeWidth : 0}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

export default function DesignRenderer({
  design,
  editing = false,
  selectedId = null,
  editingTextId = null,
  onSelect,
  onTextDoubleClick,
  onTextChange,
  onTextBlur,
  planeRef,
  registerElementRef,
  className = "",
  style,
}) {
  if (!design) return null;

  const elements = Array.isArray(design.elements) ? design.elements : [];

  return (
    <div
      ref={planeRef}
      className={className}
      onMouseDown={
        editing
          ? (e) => {
              if (e.target === e.currentTarget) {
                onSelect?.(null, e);
              }
            }
          : undefined
      }
      style={{
        position: "relative",
        width: `${design.width}px`,
        height: `${design.height}px`,
        background: design.background || "#ffffff",
        overflow: "hidden",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {elements.map((el) => {
        const isSelected = editing && selectedId === el.id;
        return (
          <div
            key={el.id}
            data-element-id={el.id}
            data-element-type={el.type}
            ref={registerElementRef ? (node) => registerElementRef(el.id, node) : undefined}
            onMouseDown={
              editing
                ? (e) => {
                    e.stopPropagation();
                    onSelect?.(el.id, e);
                  }
                : undefined
            }
            onDoubleClick={
              editing && el.type === "text"
                ? (e) => {
                    e.stopPropagation();
                    onTextDoubleClick?.(el.id, e);
                  }
                : undefined
            }
            style={{
              position: "absolute",
              left: `${el.x}px`,
              top: `${el.y}px`,
              width: `${el.width}px`,
              height: `${el.height}px`,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              transformOrigin: "center center",
              opacity: el.opacity ?? 1,
              boxSizing: "border-box",
              cursor: editing ? (editingTextId === el.id ? "text" : "move") : "default",
              outline:
                isSelected && editingTextId !== el.id
                  ? "1px solid rgba(37, 99, 235, 0.35)"
                  : undefined,
            }}
          >
            {el.type === "text" &&
              renderTextElement(el, {
                editing,
                editingTextId,
                onTextChange,
                onTextBlur,
              })}
            {el.type === "image" && renderImageElement(el)}
            {el.type === "shape" && renderShapeElement(el)}
          </div>
        );
      })}
    </div>
  );
}
