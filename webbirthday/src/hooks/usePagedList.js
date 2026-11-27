import { useCallback, useEffect, useRef, useState } from "react";

export default function usePagedList(fetchPage, scope, enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const session = useRef(null);

  const load = useCallback(async (current, before) => {
    if (!current || current.busy || current.controller.signal.aborted) return;
    current.busy = true;
    setLoading(true);
    setError(false);
    try {
      const { data } = await fetchPage({ limit: 24, ...(before ? { before } : {}) }, current.controller.signal);
      if (session.current !== current || current.controller.signal.aborted) return;
      setItems((prev) => before ? [...prev, ...data.items.filter((item) => !prev.some((old) => old._id === item._id))] : data.items);
      setNextCursor(data.nextCursor);
    } catch {
      if (session.current === current && !current.controller.signal.aborted) setError(true);
    } finally {
      current.busy = false;
      if (session.current === current && !current.controller.signal.aborted) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    const current = { controller: new AbortController(), busy: false };
    session.current = current;
    setItems([]);
    setNextCursor(null);
    setError(false);
    setLoading(false);
    if (enabled) load(current);
    return () => { current.controller.abort(); };
  }, [load, scope, enabled]);

  return { items, setItems, loading, error, hasMore: Boolean(nextCursor), loadMore: () => load(session.current, nextCursor), retry: () => load(session.current, nextCursor) };
}
