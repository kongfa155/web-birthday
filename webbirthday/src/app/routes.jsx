import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout.jsx";
import UserManager from "../pages/UserManager/UserManager.jsx";
import CardManager from "../pages/CardManager/CardManager.jsx";
import TemplateManager from "../pages/TemplateManager/TemplateManager.jsx";
import EditPage from "../pages/EditPage/EditPage.jsx";
import Login from "../pages/Login/Login.jsx";
import { ProtectedRoute, AdminRoute } from "./ProtectedRoute.jsx";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/cards" element={<CardManager />} />

          <Route element={<AdminRoute />}>
            <Route path="/users" element={<UserManager />} />
            <Route path="/templates" element={<TemplateManager />} />
          </Route>
        </Route>

        <Route path="/edit/:mode/:id" element={<EditPage />} />
        <Route path="/view/cards/:id" element={<EditPage viewOnly={true} />} />
      </Route>

      <Route path="/" element={<Navigate to="/cards" replace />} />
    </Routes>
  );
}

export default AppRoutes;
