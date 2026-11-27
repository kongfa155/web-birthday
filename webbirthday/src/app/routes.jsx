import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import MainLayout from "../layouts/MainLayout.jsx";
import UserManager from "../pages/UserManager/UserManager.jsx";
import CardManager from "../pages/CardManager/CardManager.jsx";
import TemplateManager from "../pages/TemplateManager/TemplateManager.jsx";
import Login from "../pages/Login/Login.jsx";
import Register from "../pages/Register/Register.jsx";
import { ProtectedRoute, AdminRoute, GuestRoute } from "./ProtectedRoute.jsx";

const EditPage = lazy(() => import("../pages/EditPage/EditPage.jsx"));

function AppRoutes() {
  return (
    <Suspense fallback={<div role="status">Đang tải trang...</div>}>
    <Routes>
      {/* Public guest-only routes */}
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/cards" element={<CardManager />} />

          {/* Admin-only manager routes */}
          <Route element={<AdminRoute />}>
            <Route path="/users" element={<UserManager />} />
            <Route path="/templates" element={<TemplateManager />} />
          </Route>
        </Route>

        <Route path="/edit/cards/:id" element={<EditPage editorMode="cards" />} />
        {/* Template editing remains admin-only. */}
        <Route element={<AdminRoute />}>
          <Route path="/edit/templates/:id" element={<EditPage editorMode="templates" />} />
        </Route>

        {/* Read-only card view for authenticated users */}
        <Route path="/view/cards/:id" element={<EditPage viewOnly={true} />} />
      </Route>

      {/* Root path redirects to /cards */}
      <Route path="/" element={<Navigate to="/cards" replace />} />

      {/* Not found fallback */}
      <Route path="*" element={<Navigate to="/cards" replace />} />
    </Routes>
    </Suspense>
  );
}

export default AppRoutes;
