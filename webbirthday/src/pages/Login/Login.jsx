import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./Login.module.css";
import { loginUser } from "../../services/userService";
import { useAuth } from "../../context/AuthContext";
import GoogleSignIn from "../../components/auth/GoogleSignIn";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPending || isGooglePending) return;
    setSubmitted(true);
    setErrMsg("");

    const trimmedUsername = username.trim();

    // Legacy accounts: only check nonempty username and password, no length restrictions
    if (!trimmedUsername) {
      setErrMsg("Tên đăng nhập không được để trống");
      return;
    }

    if (!password) {
      setErrMsg("Mật khẩu không được để trống");
      return;
    }

    setIsPending(true);

    try {
      const res = await loginUser({
        username: trimmedUsername,
        password: password, // exact password preserved without mutating or trimming
      });

      const user = res.data?.user;
      const token = res.data?.token;

      // Update auth context and storage
      login(user, token);

      // Navigate immediately to /cards
      navigate("/cards", { replace: true });
    } catch (err) {
      // Generic error or server error message
      const serverMessage =
        err.response?.data?.message ||
        (err.response?.status === 401
          ? "Tên đăng nhập hoặc mật khẩu không chính xác"
          : err.response?.status === 403
          ? "Tài khoản của bạn đã bị vô hiệu hóa"
          : "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin!");
      setErrMsg(serverMessage);
    } finally {
      setIsPending(false);
    }
  };

  const trimmedUsername = username.trim();
  const usernameInvalid = submitted && !trimmedUsername;
  const passwordInvalid = submitted && !password;

  const isAnyPending = isPending || isGooglePending;

  return (
    <div className={styles.loginContainer}>
      <div className={styles.layoutLogin}>
        <div className={styles.header}>
          <div className={styles.circle}></div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h1 className={styles.formTitle}>Đăng nhập</h1>

          <div className={styles.inputGroup}>
            <label htmlFor="login-username" className={styles.inputLabel}>
              Tên đăng nhập
            </label>
            <input
              id="login-username"
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Nhập tên đăng nhập"
              value={username}
              disabled={isAnyPending}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errMsg) setErrMsg("");
              }}
              className={`${styles.textInput} ${
                usernameInvalid ? styles.inputInvalid : ""
              }`}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="login-password" className={styles.inputLabel}>
              Mật khẩu
            </label>
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              value={password}
              disabled={isAnyPending}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errMsg) setErrMsg("");
              }}
              className={`${styles.textInput} ${
                passwordInvalid ? styles.inputInvalid : ""
              }`}
            />
          </div>

          {errMsg && (
            <p className={styles.errorMessage} role="alert">
              {errMsg}
            </p>
          )}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isAnyPending}
          >
            {isPending ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>hoặc</span>
          <span className={styles.dividerLine} />
        </div>

        <div className={styles.googleSection}>
          <GoogleSignIn
            disabled={isAnyPending}
            onPendingChange={setIsGooglePending}
          />
        </div>

        <p className={styles.switchAuthText}>
          Chưa có tài khoản?{" "}
          <Link to="/register" className={styles.authLink}>
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
