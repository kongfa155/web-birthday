import { useEffect } from "react";

function isEditableKeyboardTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  const tagName = String(target.tagName || "").toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

/**
 * Attaches global editor keyboard shortcuts (undo, redo, delete) while guarding editable targets.
 */
export default function useEditorShortcuts({
  saving,
  confirmState,
  selectedId,
  editingTextId,
  onUndo,
  onRedo,
  onDelete,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (saving || confirmState) return;
      if (isEditableKeyboardTarget(event.target)) return;

      const isMod = event.ctrlKey || event.metaKey;

      if (isMod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (isMod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        onRedo();
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedId &&
        editingTextId !== selectedId
      ) {
        event.preventDefault();
        onDelete(selectedId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    saving,
    confirmState,
    selectedId,
    editingTextId,
    onUndo,
    onRedo,
    onDelete,
  ]);
}
