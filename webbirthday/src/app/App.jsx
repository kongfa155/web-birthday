import Login from "../pages/Login/Login.jsx";
import AppRoutes from "./routes.jsx";
import "react-toastify/dist/ReactToastify.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import { ToastContainer } from "react-toastify";
import { useAuth } from "../context/AuthContext.jsx";
export default function App() {
  const { user } = useAuth();

  return (
    <>
      {user ? <AppRoutes /> : <Login />}
      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
