import React, { useState } from "react";
import AdminTopSection from "./AdminTopSection/AdminTopSection";
import AdminBottomSection from "./AdminBottomSection/AdminBottomSection";
import "./UserManager.module.css";

const UserManager = () => {
     const [searchTerm, setSearchTerm] = useState("");
    
  return (
    <div className="admin-container">
      <AdminTopSection searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <AdminBottomSection searchTerm={searchTerm} />
    </div>
  );
};

export default UserManager;
