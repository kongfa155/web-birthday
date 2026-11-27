import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Cho phép khách chưa login truy cập (/login, /register). Nếu đã login thì sang /cards
export const GuestRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return <div role="status">Đang kiểm tra phiên đăng nhập...</div>;

  if (user) return <Navigate to="/cards" replace />;

  return <Outlet />;
};

// Chỉ cho phép user đã login truy cập
export const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return <div role="status">Đang kiểm tra phiên đăng nhập...</div>;

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
};

// Chỉ cho phép admin truy cập
export const AdminRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return <div role="status">Đang kiểm tra phiên đăng nhập...</div>;

  if (!user) return <Navigate to="/login" replace />;

  if (!user.isAdmin) return <Navigate to="/cards" replace />;

  return <Outlet />;
};
