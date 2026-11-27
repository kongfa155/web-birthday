import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FaBars } from "react-icons/fa";
import { TbCards } from "react-icons/tb";
import { CgProfile } from "react-icons/cg";
import { BiCategory, BiLogOut } from "react-icons/bi";
import styles from "./Sidebar.module.css";
import { useAuth } from "../../../context/AuthContext";

const allMenuItems = [
  { to: "/users", icon: <CgProfile color="black" />, label: "Quản lý User" },
  { to: "/cards", icon: <TbCards color="black" />, label: "Quản lý thiệp" },
  { to: "/templates", icon: <BiCategory color="black" />, label: "Quản lý Template" },
];

const Sidebar = ({ open, setOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Lọc ra các menu item được phép hiển thị
  const visibleMenuItems = allMenuItems.filter((item) => {
    // User và Admin đều thấy "Quản lý thiệp"
    if (item.to === "/cards") return true;
    // Chỉ Admin mới thấy các mục còn lại
    if (user && user.isAdmin) return true;
    return false;
  });

  return (
    <div
      className={`${styles.sidebar} ${
        open ? styles.sidebarOpen : styles.sidebarCollapsed
      }`}
    >
      {/* Toggle */}
      <div className={styles.sidebarHeader}>
        <button
          className={`${styles.toggleBtn} ${
            open ? styles.toggleBtnShifted : ""
          }`}
          onClick={() => setOpen(!open)}
          aria-label="Thu gọn hoặc mở rộng thanh điều hướng"
          type="button"
        >
          <FaBars />
        </button>
      </div>

      {/* Menu items */}
      <ul className={styles.menuList}>
        {visibleMenuItems.map(({ to, icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `${styles.menuItem} ${isActive ? styles.activeLink : ""}`
              }
            >
              {icon}
              <span
                className={`${styles.menuText} ${
                  !open ? styles.sidebarCollapsedText : ""
                }`}
              >
                {label}
              </span>
            </NavLink>
          </li>
        ))}

        <li>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.logoutBtn}`}
            onClick={handleLogout}
            aria-label="Đăng xuất tài khoản"
            title="Đăng xuất"
          >
            <BiLogOut color="black" size={20} />
            <span
              className={`${styles.menuText} ${
                !open ? styles.sidebarCollapsedText : ""
              }`}
            >
              Đăng xuất
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
