/**
 * Sanitizes a design name for use as a downloaded PNG filename.
 */
export function sanitizeFileName(name) {
  const cleaned = String(name || "thiep-sinh-nhat")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-");
  return cleaned || "thiep-sinh-nhat";
}

/**
 * Computes the zoom factor that fits the design document inside the stage viewport.
 */
export function computeFitZoom(viewportEl, doc) {
  if (!viewportEl || !doc) return 0.5;
  const vw = Math.max(viewportEl.clientWidth - 56, 120);
  const vh = Math.max(viewportEl.clientHeight - 56, 120);
  return Math.max(
    0.15,
    Math.min(vw / Math.max(doc.width, 1), vh / Math.max(doc.height, 1), 1.25)
  );
}
