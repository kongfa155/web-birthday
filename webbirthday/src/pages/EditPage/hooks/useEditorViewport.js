import { useEffect, useRef, useState } from "react";
import { computeFitZoom } from "../editorHelpers.js";

/**
 * Manages stage viewport ref, responsive fit zoom calculation, and manual zoom state.
 */
export default function useEditorViewport({ docRef, width, height }) {
  const [fitZoom, setFitZoom] = useState(0.5);
  const [manualZoom, setManualZoom] = useState(null);
  const zoom = manualZoom ?? fitZoom;

  const stageViewportRef = useRef(null);

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
  }, [width, height, docRef]);

  return {
    stageViewportRef,
    fitZoom,
    manualZoom,
    setManualZoom,
    zoom,
  };
}
