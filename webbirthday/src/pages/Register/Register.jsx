import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./Register.module.css";
import { registerUser } from "../../services/userService";
import { useAuth } from "../../context/AuthContext";

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPending) return;
    setSubmitted(true);
    setErrMsg("");

    const trimmedUsername = username.trim();

    // Client validation
    if (!trimmedUsername) {
      setErrMsg("Tên đăng nhập không được để trống");
      return;
    }

    if (trimmedUsername.length > 64) {
      setErrMsg("Tên đăng nhập không được vượt quá 64 ký tự");
      return;
    }

    if (!password) {
      setErrMsg("Mật khẩu không được để trống");
      return;
    }

    if (Array.from(password).length < 6) {
      setErrMsg("Mật khẩu phải chứa ít nhất 6 ký tự");
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setErrMsg("Mật khẩu quá dài; vui lòng dùng tối đa 72 byte UTF-8");
      return;
    }

    if (password !== confirmPassword) {
      setErrMsg("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsPending(true);

    try {
      // Contract: POST /api/users/register accepts ONLY username, password
      const res = await registerUser({
        username: trimmedUsername,
        password: password, // exact password preserved without mutating or trimming
      });

      const registeredUser = res.data?.user;
      const token = res.data?.token;

      // Update auth context and storage
      login(registeredUser, token);

      // Navigate to /cards without approval screen
      navigate("/cards", { replace: true });
    } catch (err) {
      const serverMessage =
        err.response?.data?.message ||
        (err.response?.status === 409
          ? "Tên đăng nhập đã tồn tại trong hệ thống"
          : err.response?.status === 429
          ? "Quá nhiều yêu cầu, vui lòng thử lại sau"
          : "Đăng ký thất bại, vui lòng thử lại!");
      setErrMsg(serverMessage);
    } finally {
      setIsPending(false);
    }
  };

  const trimmedUsername = username.trim();
  const usernameInvalid =
    submitted && (!trimmedUsername || trimmedUsername.length > 64);
  const passwordInvalid =
    submitted &&
    (!password ||
      Array.from(password).length < 6 ||
      new TextEncoder().encode(password).length > 72);
  const confirmInvalid =
    submitted && (!confirmPassword || password !== confirmPassword);

  return (
    <div className={styles.registerContainer}>
      <div className={styles.layoutRegister}>
        <div className={styles.header}>
          <div className={styles.circle}></div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h1 className={styles.formTitle}>Đăng ký tài khoản</h1>

          <div className={styles.inputGroup}>
            <label htmlFor="register-username" className={styles.inputLabel}>
              Tên đăng nhập
            </label>
            <input
              id="register-username"
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Nhập tên đăng nhập (1-64 ký tự)"
              value={username}
              disabled={isPending}
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
            <label htmlFor="register-password" className={styles.inputLabel}>
              Mật khẩu
            </label>
            <input
              id="register-password"
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
              value={password}
              disabled={isPending}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errMsg) setErrMsg("");
              }}
              className={`${styles.textInput} ${
                passwordInvalid ? styles.inputInvalid : ""
              }`}
            />
          </div>

          <div className={styles.inputGroup}>
            <label
              htmlFor="register-confirm-password"
              className={styles.inputLabel}
            >
              Xác nhận mật khẩu
            </label>
            <input
              id="register-confirm-password"
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              disabled={isPending}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errMsg) setErrMsg("");
              }}
              className={`${styles.textInput} ${
                confirmInvalid ? styles.inputInvalid : ""
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
            disabled={isPending}
          >
            {isPending ? "Đang xử lý..." : "Đăng ký"}
          </button>

          <p className={styles.switchAuthText}>
            Đã có tài khoản?{" "}
            <Link to="/login" className={styles.authLink}>
              Đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
