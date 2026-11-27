import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/common/Sidebar/Sidebar.jsx";
import styles from "./MainLayout.module.css";

function MainLayout() {
  const [openSideBar, setOpenSideBar] = useState(false);
  return (
    <div className="App">
      <Sidebar open={openSideBar} setOpen={setOpenSideBar} />
      <div
        className={`${styles.main} ${openSideBar ? styles.mainShifted : ""}`}
      >
        <Outlet />
      </div>
    </div>
  );
}

export default MainLayout;
