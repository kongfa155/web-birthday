# Web tạo thiệp chúc mừng sinh nhật

Dự án nhóm của: Tuấn Duy, Công Pha, Huanz

## Cập nhật DP-01: refactor mã nguồn

Đã gỡ 19 file cũ/ghi chú không còn sử dụng, tách upload thành route/controller/service,
và tách editor thành hook lịch sử, phím tắt, lưu/xuất PNG, viewport cùng các component
thanh công cụ, hộp xác nhận và điều khiển Moveable. Giữ nguyên chức năng, giao diện,
API và hỗ trợ xem thiệp Fabric cũ. Không thay đổi database hoặc dependency.
Xem [cấu trúc, kiểm tra từng bước và cách quay lui DP-01](docs/DP-01.md).

## Editor tạo thiệp

Editor mới dùng React/React DOM 19.3.1, HTML/CSS và Moveable; không cần API key
hay giấy phép SDK. Có mẫu sinh nhật dựng sẵn, kéo thả, chỉnh chữ/ảnh, lớp,
undo/redo, thumbnail và xuất PNG. Thiệp Fabric cũ vẫn xem được.
Xem [cấu hình, dữ liệu, kiểm thử và rollback](docs/EDITOR.md).

## Cập nhật TU-02: đăng nhập Google

Trang đăng nhập và đăng ký có nút Google, dùng Google Identity Services và Client ID
cấu hình trong env. Lần đầu tạo tài khoản USER riêng không có mật khẩu nội bộ;
những lần sau nhận diện bằng Google `sub`. Không gộp email vào tài khoản cũ.

Xem [cấu hình, API, thay đổi dữ liệu và kiểm thử TU-02](docs/TU-02.md).
Backend yêu cầu Node.js 22 trở lên. Giữ nguyên các cấu hình TU-01 hiện có.

## Cập nhật TU-01: đăng ký tài khoản

Người dùng có thể mở `/register`, đăng ký và tự đăng nhập vào `/cards`.
Tên đăng nhập phân biệt hoa/thường; mật khẩu đăng ký tối thiểu 6 ký tự.
Backend đã kiểm tra JWT, trạng thái tài khoản và quyền truy cập dữ liệu.
Admin chỉ xem thông tin tài khoản và số lượng thiệp của người dùng.

Xem [phạm vi, API, kiểm thử và điều kiện phát hành TU-01](docs/TU-01.md).
User tự tạo/gửi thiệp là hạng mục tiếp theo, chưa nằm trong TU-01.

Kiểm thử backend không kết nối database thật:

```bash
cd webbirthday/backend
npm test
```

## Cấu trúc dự án

```text
webbirthday/
├── src/
│   ├── app/                 # App, khai báo route và guard phân quyền
│   ├── layouts/             # Khung trang với Sidebar và Outlet
│   ├── pages/
│   │   ├── Login/
│   │   ├── Register/
│   │   ├── CardManager/
│   │   ├── TemplateManager/
│   │   ├── UserManager/
│   │   ├── EditPage/
│   │   └── SharedCard/
│   ├── components/
│   │   ├── auth/
│   │   ├── common/          # Giao diện dùng chung
│   │   └── design/          # Bộ xem thiệp DOM và LegacyFabricViewer
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
    ├── services/            # Upload Cloudinary dùng chung
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
Trước đó, ở đợt chuẩn hóa cấu trúc ban đầu, các file ghi chú và helper cũ được giữ lại để rà soát riêng; đến checkpoint DP-01 B1 các file không còn sử dụng đã được gỡ bỏ và tài liệu hóa tại [docs/DP-01.md](docs/DP-01.md).
Trước khi chuẩn hóa, build thành công nhưng lint đã có 40 lỗi. Sau khi bỏ
hai biến không dùng trong App, lint còn 38 lỗi có sẵn và không phát sinh lỗi mới.
Các lỗi nghiệp vụ, routing và editor có sẵn cần xử lý trong đợt bảo trì riêng.
