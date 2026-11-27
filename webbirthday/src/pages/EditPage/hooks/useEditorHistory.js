import { useCallback, useRef, useState } from "react";

const MAX_HISTORY_ENTRIES = 60;
const COALESCE_WINDOW_MS = 600;

/**
 * Manages document undo/redo history, revision counter, and coalesced updates.
 */
export default function useEditorHistory(initialDoc) {
  const [history, setHistory] = useState(() => ({
    past: [],
    present: initialDoc,
    future: [],
  }));
  const [revision, setRevision] = useState(0);

  const coalesceRef = useRef({ key: null, timestamp: 0 });
  const revisionRef = useRef(0);
  const docRef = useRef(history.present);

  const doc = history.present;
  docRef.current = doc;

  const commitDoc = useCallback((updater, { coalesceKey = null } = {}) => {
    const now = Date.now();
    const shouldCoalesce =
      Boolean(coalesceKey) &&
      coalesceRef.current.key === coalesceKey &&
      now - coalesceRef.current.timestamp < COALESCE_WINDOW_MS;

    coalesceRef.current = { key: coalesceKey, timestamp: now };

    setHistory((prev) => {
      const nextPresent =
        typeof updater === "function" ? updater(prev.present) : updater;
      if (!nextPresent || nextPresent === prev.present) {
        return prev;
      }

      const nextPast = shouldCoalesce
        ? prev.past
        : [...prev.past.slice(-(MAX_HISTORY_ENTRIES - 1)), prev.present];

      return {
        past: nextPast,
        present: nextPresent,
        future: [],
      };
    });

    revisionRef.current += 1;
    setRevision(revisionRef.current);
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const undo = useCallback(() => {
    coalesceRef.current = { key: null, timestamp: 0 };
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future].slice(0, MAX_HISTORY_ENTRIES),
      };
    });
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  }, []);

  const redo = useCallback(() => {
    coalesceRef.current = { key: null, timestamp: 0 };
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present].slice(-MAX_HISTORY_ENTRIES),
        present: next,
        future: prev.future.slice(1),
      };
    });
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  }, []);

  return {
    doc,
    docRef,
    revision,
    revisionRef,
    canUndo,
    canRedo,
    commitDoc,
    undo,
    redo,
  };
}
