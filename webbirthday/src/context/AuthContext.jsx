import { createContext, useState, useContext, useEffect, useRef, useCallback } from "react";
import { getCurrentUser } from "../services/userService";

const AuthContext = createContext(null);
const readToken = () => {
  try { return localStorage.getItem("token"); } catch { return null; }
};
const clearStorage = () => {
  try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch { /* Storage can be disabled by the browser. */ }
};

export const AuthProvider = ({ children }) => {
  // Cached user JSON is deliberately never parsed or trusted.
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(readToken()));
  const generation = useRef(0);

  const logout = useCallback(() => {
    generation.current += 1;
    clearStorage();
    setUser(null);
    setLoading(false);
  }, []);

  const login = useCallback((userData, token) => {
    if (!userData?._id || typeof token !== "string" || !token) {
      throw new Error("Phản hồi đăng nhập không hợp lệ.");
    }
    generation.current += 1;
    try {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(userData));
    } catch { /* The next API request will verify whether the session can be persisted. */ }
    setUser(userData);
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = readToken();
    if (!token) { setLoading(false); return; }
    const current = ++generation.current;
    let active = true;
    const isCurrent = () => active && current === generation.current && token === readToken();
    getCurrentUser()
      .then(({ data }) => {
        if (!isCurrent()) return;
        if (!data?.user?._id) throw new Error("Invalid session response");
        setUser(data.user);
        try { localStorage.setItem("user", JSON.stringify(data.user)); } catch { /* Optional cache only. */ }
      })
      .catch(() => {
        if (isCurrent()) { clearStorage(); setUser(null); }
      })
      .finally(() => { if (active && current === generation.current) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.addEventListener("auth:unauthorized", logout);
    return () => window.removeEventListener("auth:unauthorized", logout);
  }, [logout]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
};

// Kept together to preserve existing imports throughout the application.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
