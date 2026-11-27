import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./GoogleSignIn.module.css";
import { useAuth } from "../../context/AuthContext";
import { getGoogleChallenge, loginWithGoogle } from "../../services/userService";
import {
  loadGoogleIdentityScript,
  initializeGoogleSignIn,
  renderGoogleSignInButton,
} from "../../utils/googleIdentity";

/**
 * Reusable Google Sign-In button component complying with TU-02.
 *
 * Props:
 * - disabled: boolean (e.g. while password login is pending)
 * - onPendingChange: (isPending: boolean) => void
 * - width: number (optional pixel width, default: 320)
 */
export default function GoogleSignIn({
  disabled = false,
  onPendingChange,
  width = 320,
}) {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Status: 'idle' | 'loading' | 'ready' | 'authenticating' | 'error'
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const buttonContainerRef = useRef(null);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const activeRegistrationRef = useRef(null);
  const currentInitIdRef = useRef(0);

  // Keep ref updated so callbacks know if disabled without re-running the initialization effect
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Handle GIS credential callback
  const handleCredentialResponse = useCallback(
    async (response) => {
      // Ignore if component unmounted
      if (!isMountedRef.current) return;

      // Ignore if registration is no longer current or session mismatched
      if (
        !activeRegistrationRef.current ||
        !activeRegistrationRef.current.isCurrent()
      ) {
        return;
      }

      // Prevent duplicate submissions or action while disabled
      if (isSubmittingRef.current || disabledRef.current) {
        return;
      }

      // Validate missing credential
      const credential = response?.credential;
      if (!credential || typeof credential !== "string") {
        setStatus("error");
        setErrorMessage(
          "Không nhận được thông tin xác thực từ Google. Vui lòng thử lại."
        );
        return;
      }

      isSubmittingRef.current = true;
      setStatus("authenticating");
      onPendingChange?.(true);
      setErrorMessage("");

      try {
        const res = await loginWithGoogle(credential);

        if (!isMountedRef.current) return;

        const user = res.data?.user;
        const token = res.data?.token;

        // Login using existing AuthContext
        login(user, token);

        // Navigate to /cards
        navigate("/cards", { replace: true });
      } catch (err) {
        if (!isMountedRef.current) return;

        const serverMessage =
          err.response?.data?.message ||
          (err.response?.status === 401
            ? "Đăng nhập Google không thành công. Thông tin xác thực không hợp lệ."
            : err.response?.status === 403
            ? "Tài khoản của bạn đã bị vô hiệu hóa."
            : err.response?.status === 429
            ? "Quá nhiều yêu cầu. Vui lòng thử lại sau."
            : "Đăng nhập bằng Google thất bại. Vui lòng thử lại!");

        setStatus("error");
        setErrorMessage(serverMessage);

        // Invalidate current registration so single-use nonce cannot be reused
        if (activeRegistrationRef.current) {
          activeRegistrationRef.current.unregister();
          activeRegistrationRef.current = null;
        }
      } finally {
        isSubmittingRef.current = false;
        if (isMountedRef.current) {
          onPendingChange?.(false);
        }
      }
    },
    [login, navigate, onPendingChange]
  );

  // Initialize GIS and fetch challenge nonce
  // NOTE: Reinitialize only on mount or explicit retry/fresh challenge.
  // Disabled prop changes MUST NOT recreate nonce or re-run initialization.
  useEffect(() => {
    isMountedRef.current = true;
    const initId = ++currentInitIdRef.current;
    let cancelled = false;

    const setupGoogle = async () => {
      setStatus("loading");
      setErrorMessage("");

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        if (!cancelled && isMountedRef.current && initId === currentInitIdRef.current) {
          setStatus("error");
          setErrorMessage(
            "Chưa cấu hình Google Client ID. Vui lòng liên hệ quản trị viên."
          );
        }
        return;
      }

      try {
        // Step 1: Load SDK singleton
        await loadGoogleIdentityScript();
        if (cancelled || !isMountedRef.current || initId !== currentInitIdRef.current) {
          return;
        }

        // Step 2: Call challenge only after SDK is loaded and component still mounted
        const challengeRes = await getGoogleChallenge();
        if (cancelled || !isMountedRef.current || initId !== currentInitIdRef.current) {
          return;
        }

        const nonce = challengeRes.data?.nonce;
        if (!nonce) {
          throw new Error("Phiên đăng nhập Google chưa sẵn sàng. Vui lòng thử lại.");
        }

        // Step 3: Initialize Google with client_id, nonce, callback, popup mode
        const registration = initializeGoogleSignIn({
          clientId,
          nonce,
          callback: handleCredentialResponse,
        });
        activeRegistrationRef.current = registration;

        // Step 4: Render branded Google button
        if (buttonContainerRef.current) {
          buttonContainerRef.current.innerHTML = "";
          renderGoogleSignInButton(buttonContainerRef.current, {
            type: "standard",
            text: "signin_with",
            theme: "outline",
            size: "large",
            locale: "vi",
            width: Math.max(200, Math.min(width, buttonContainerRef.current.parentElement?.clientWidth || width)),
          });
        }

        if (!cancelled && isMountedRef.current && initId === currentInitIdRef.current) {
          setStatus("ready");
        }
      } catch (err) {
        if (cancelled || !isMountedRef.current || initId !== currentInitIdRef.current) {
          return;
        }
        setStatus("error");
        const msg =
          err.response?.data?.message ||
          err.message ||
          "Không thể khởi tạo phiên đăng nhập Google. Vui lòng thử lại.";
        setErrorMessage(msg);
      }
    };

    setupGoogle();

    return () => {
      cancelled = true;
      if (activeRegistrationRef.current) {
        activeRegistrationRef.current.unregister();
        activeRegistrationRef.current = null;
      }
    };
  }, [retryCount, handleCredentialResponse, width]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      onPendingChange?.(false);
    };
  }, [onPendingChange]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const isInteractiveDisabled = disabled || status === "authenticating";

  return (
    <div className={styles.container}>
      {status === "loading" && (
        <div className={styles.statusContainer} aria-busy="true">
          <div className={styles.spinner} />
          <span>Đang kết nối tới Google...</span>
        </div>
      )}

      {status === "authenticating" && (
        <div
          className={styles.statusContainer}
          role="status"
          aria-live="polite"
        >
          <div className={styles.spinner} />
          <span>Đang xác thực với Google...</span>
        </div>
      )}

      {status === "error" && (
        <div className={styles.errorContainer}>
          <p className={styles.errorMessage} role="alert">
            {errorMessage}
          </p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={handleRetry}
            disabled={disabled || isSubmittingRef.current}
          >
            Thử lại
          </button>
        </div>
      )}

      <div
        className={`${styles.buttonWrapper} ${
          isInteractiveDisabled ? styles.disabled : ""
        }`}
        style={{
          display:
            status === "ready" || status === "authenticating"
              ? "flex"
              : "none",
        }}
        aria-disabled={isInteractiveDisabled}
      >
        <div ref={buttonContainerRef} />
        {isInteractiveDisabled && (
          <div className={styles.overlay} aria-hidden="true" />
        )}
      </div>

      <p className={styles.hintText}>
        Tài khoản Google hoạt động độc lập với tài khoản mật khẩu.
      </p>
    </div>
  );
}
