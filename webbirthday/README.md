# Web tạo thiệp chúc mừng sinh nhật

Dự án nhóm của: Tuấn Duy, Công Pha, Huanz

## Cấu trúc dự án

```text
webbirthday/
├── src/
│   ├── app/                 # App, khai báo route và guard phân quyền
│   ├── layouts/             # Khung trang với Sidebar và Outlet
│   ├── pages/
│   │   ├── Login/
│   │   ├── CardManager/
│   │   ├── TemplateManager/
│   │   ├── UserManager/
│   │   ├── EditPage/
│   │   └── UserViewCard/     # Component cũ, chưa nối vào route hiện tại
│   ├── components/common/   # Giao diện dùng chung
│   ├── context/             # Trạng thái xác thực
│   ├── services/            # Gọi API
│   ├── utils/
│   ├── assets/
│   └── main.jsx             # Điểm khởi động React
├── public/
└── backend/
    ├── config/
    ├── controllers/
    ├── middlewares/
    ├── models/
    ├── routes/
    ├── utils/
    └── server.js
```

Component chỉ phục vụ một trang đặt trong thư mục trang đó, cùng CSS của nó.
Chỉ đưa component vào `components/common` khi thực sự dùng chung.
`app/routes.jsx` khai báo URL và cây route; `layouts/MainLayout.jsx` quản lý
khung giao diện. Backend tiếp tục giữ cách phân lớp hiện tại.

## Chạy dự án

Từ thư mục gốc repository, mở hai terminal.

Frontend:

```bash
cd webbirthday
npm install
npm run dev
```

Backend:

```bash
cd webbirthday/backend
npm install
npm run dev
```

Backend đọc cấu hình từ `webbirthday/backend/.env`. Giữ cấu hình hiện có;
các biến gồm `MONGO_URI`, `JWT_SECRET`, `CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` và `PORT` (mặc định 5000).
Không đưa giá trị bí mật vào tài liệu hoặc Git.
Frontend dùng Vite; mặc định truy cập `http://localhost:5173`.

## Kiểm tra và phạm vi chuẩn hóa

Chạy từ `webbirthday/`:

```bash
npm run build
npm run lint
```

Đợt chuẩn hóa chỉ thay vị trí file, tên trang quản lý người dùng và tách
App/routes/layout. Giữ nguyên URL, cây phân quyền, luồng chức năng, API,
giao diện, cấu trúc database và các dependency. Không chạy migration.
Các file ghi chú và helper cũ được giữ để rà soát riêng.
Trước khi chuẩn hóa, build thành công nhưng lint đã có 40 lỗi. Sau khi bỏ
hai biến không dùng trong App, lint còn 38 lỗi có sẵn và không phát sinh lỗi mới.
Các lỗi nghiệp vụ, routing và editor có sẵn cần xử lý trong đợt bảo trì riêng.


