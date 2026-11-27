import Moveable from "react-moveable";

/**
 * Renders Moveable transform handles for the active element without wrapper DOM.
 */
export default function EditorTransformControls({
  selectedElement,
  selectedNode,
  stageViewportRef,
  moveableRef,
  interactionRef,
  onUpdateElement,
}) {
  const beginInteraction = () => {
    interactionRef.current = {
      id: selectedElement.id,
      moved: false,
      patch: null,
    };
  };

  const finishInteraction = () => {
    const cur = interactionRef.current;
    interactionRef.current = null;
    if (cur?.moved && cur.patch) {
      onUpdateElement(cur.id, cur.patch);
    }
  };

  return (
    <Moveable
      ref={moveableRef}
      target={selectedNode}
      container={stageViewportRef.current}
      rootContainer={stageViewportRef.current}
      useResizeObserver
      zoom={1}
      origin={false}
      draggable
      resizable
      rotatable
      throttleDrag={0}
      throttleResize={0}
      throttleRotate={0}
      onDragStart={({ set }) => {
        beginInteraction();
        set([selectedElement.x, selectedElement.y]);
      }}
      onDrag={({ target, beforeTranslate }) => {
        const x = Math.round(beforeTranslate[0]);
        const y = Math.round(beforeTranslate[1]);
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;
        if (interactionRef.current) {
          interactionRef.current.moved = true;
          interactionRef.current.patch = { x, y };
        }
      }}
      onDragEnd={finishInteraction}
      onResizeStart={({ setOrigin, dragStart }) => {
        beginInteraction();
        setOrigin(["%", "%"]);
        if (dragStart) {
          dragStart.set([selectedElement.x, selectedElement.y]);
        }
      }}
      onResize={({ target, width, height, drag }) => {
        const w = Math.max(1, Math.min(8192, Math.round(width)));
        const h = Math.max(1, Math.min(8192, Math.round(height)));
        const x = Math.round(drag.beforeTranslate[0]);
        const y = Math.round(drag.beforeTranslate[1]);
        target.style.width = `${w}px`;
        target.style.height = `${h}px`;
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;
        if (interactionRef.current) {
          interactionRef.current.moved = true;
          interactionRef.current.patch = { x, y, width: w, height: h };
        }
      }}
      onResizeEnd={finishInteraction}
      onRotateStart={({ set }) => {
        beginInteraction();
        set(selectedElement.rotation || 0);
      }}
      onRotate={({ target, beforeRotate }) => {
        const rotation = Math.round(beforeRotate);
        target.style.transform = rotation ? `rotate(${rotation}deg)` : "";
        if (interactionRef.current) {
          interactionRef.current.moved = true;
          interactionRef.current.patch = { rotation };
        }
      }}
      onRotateEnd={finishInteraction}
    />
  );
}
