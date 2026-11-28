# Web tạo thiệp chúc mừng sinh nhật

Dự án nhóm của: Nguyễn Ngọc Phương Huỳnh – B2303872 (Developer/tester), Nguyễn Hà Huân – B2303869 (Developer/tester), Đào Công Pha – B2306678 (BA/người duyệt).

## Tính năng hiện hành

### Xác thực và phiên đăng nhập

- Hỗ trợ đăng ký (`/register`), đăng nhập (`/login`) bằng tên đăng nhập/mật khẩu và đăng nhập Google (Google Identity Services).
- Tên đăng nhập phân biệt hoa/thường (1–64 ký tự); mật khẩu đăng ký tối thiểu 6 ký tự và tối đa 72 byte UTF-8.
- Phiên JWT có thời hạn **1 ngày** (`1d`), bao gồm phiên sau khi đăng nhập Google. Luồng Google dùng nonce một lần có thời hạn **5 phút** (`300` giây) kèm cookie và kiểm tra Origin.
- Mỗi request cần quyền đều xác thực chữ ký JWT và kiểm tra trạng thái hoạt động, vai trò trực tiếp từ database qua `/api/users/me` và middleware xác thực.

### Editor và định dạng thiết kế DOM

- Editor dùng React/React DOM 19.3.1, HTML/CSS, `react-moveable` (MIT) và `html-to-image` (MIT); không cần API key hay giấy phép SDK.
- **Bỏ hoàn toàn hỗ trợ Fabric và dependency Fabric**: toàn bộ hệ thống chỉ sử dụng định dạng thiết kế DOM `schemaVersion: 1` (`designFormat: "dom"`).
- Người dùng tạo thiệp mới từ mẫu có sẵn hoặc tạo thiệp trắng (`blank: true`); có thư viện mẫu dựng sẵn, kéo/đổi cỡ/xoay phần tử chữ, ảnh, hình khối, quản lý lớp, undo/redo, thumbnail và xuất PNG.
- Ảnh tải lên qua `/api/upload-base64` hỗ trợ tối đa **5 MiB** mỗi ảnh (request body tối đa 10 MB).
- Chi tiết cấu hình, schema và API xem tại [docs/EDITOR.md](docs/EDITOR.md).

### Phân quyền, hạn mức tạo thiệp và chia sẻ

- Mỗi tài khoản chỉ đọc, sửa và xóa thiệp thuộc quyền sở hữu của mình (`owner`).
- **Giới hạn số thiệp**: chỉ tài khoản **User** bị giới hạn tối đa **20 thiệp** (`MAX_USER_CARDS = 20`); tài khoản **Admin** được miễn giới hạn này.
- Khi User tạo thiệp, backend chạy trong **MongoDB transaction** (`createCardWithinQuota`): tăng trường `users.__v` sẵn có với `{ timestamps: false }` làm khóa tuần tự hóa theo tài khoản, sau đó đếm số thiệp và tạo bản ghi mới ngay trong transaction; không thêm index hay trường mới vào schema. Lời gọi upload/save thiết kế lên Cloudinary được cache ngoài callback retry (`preparedDesignPromise`) để tránh tạo trùng file khi transaction thử lại do xung đột ghi.
- Chia sẻ thiệp công khai qua `/share/:token` với token ngẫu nhiên (lưu hash SHA-256), cho phép bật/xoay vòng/tắt liên kết từ chủ sở hữu.

### Quản trị hệ thống (Admin)

- Trang quản lý người dùng thống kê **tổng số User** (không tính Admin) và **tổng số thiệp** toàn hệ thống (`GET /api/users/stats`).
- Bảng tài khoản hiển thị `cardCount` của từng tài khoản, hỗ trợ **tìm kiếm theo username** và **sắp xếp theo số thiệp tăng/giảm** (mặc định, tăng dần, giảm dần).
- Đã bỏ tính năng thống kê `fileCount`.

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
│   │   └── design/          # Bộ xem và dựng thiệp DOM
│   ├── context/             # Trạng thái xác thực
│   ├── services/            # Gọi API
│   ├── utils/
│   ├── assets/
│   └── main.jsx             # Điểm khởi động React
├── shared/                  # Schema DOM dùng chung frontend/backend
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

Component chỉ phục vụ một trang đặt trong thư mục trang đó cùng CSS của nó; chỉ đưa vào `components/common` khi thực sự dùng chung.

## Chạy dự án

Yêu cầu Node.js 22 trở lên. Từ thư mục gốc repository, mở hai terminal:

Frontend (`http://localhost:5173`):

```bash
cd webbirthday
npm install
npm run dev
```

Backend (`http://localhost:5000`):

```bash
cd webbirthday/backend
npm install
npm run dev
```

Backend đọc cấu hình từ `webbirthday/backend/.env` (gồm `MONGO_URI`, `JWT_SECRET`, `CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GOOGLE_CLIENT_ID` và `PORT`). Không đưa giá trị bí mật vào tài liệu hoặc Git.

## Kiểm thử và trạng thái kiểm chứng

Cần phân biệt rõ giữa **kiểm thử cô lập / mock** và **kiểm thử tích hợp thật**:

1. **Kiểm thử cô lập / hồi quy và benchmark giả lập (không kết nối DB/Cloudinary thật)**:
   - Backend (`cd webbirthday/backend && npm test`): **87/87** bài đạt (dùng mock Mongoose/Cloudinary).
   - Playwright E2E (`cd webbirthday && npm run test:editor`): **17/17** bài đạt (mock API và tài nguyên trình duyệt).
   - Frontend lint & build (`cd webbirthday && npm run lint && npm run build`): đạt.
   - Các báo cáo lịch sử/benchmark cũ trong `docs/` (như `TU-01`–`TU-05`, `TU-04-benchmark.json`, `TU-01-TU-05-db-audit.json`) được giữ nguyên bản làm tư liệu đối chiếu.

2. **Kiểm thử tích hợp thật (Real integration)**:
   - Đã thực hiện kiểm thử end-to-end trên `localhost:5000` (backend) và `localhost:5173` (frontend) kết nối MongoDB `Webbirthday` và Cloudinary thật cấu hình từ `.env`.
   - Phạm vi dữ liệu kiểm thử được duyệt: 3 tài khoản QA, 23 thiệp, 1 mẫu và các tài nguyên mới phát sinh trong lượt kiểm thử.

3. **CI / GitHub Actions**:
   - Baseline nhánh `dev` tại commit `399c946` (ngày 27/11/2026) ghi nhận workflow frontend lint/build và backend tests đạt. Kết quả đó là của mốc baseline `399c946`, chưa phải CI chạy trên các thay đổi local hiện tại.

## Tài liệu liên quan

- [docs/EDITOR.md](docs/EDITOR.md): Chi tiết kiến trúc editor DOM, dữ liệu, API upload/lưu và kiểm thử.
- [docs/DP-01.md](docs/DP-01.md): Refactor DP-01, phạm vi no-DB ban đầu và phần dọn dẹp Fabric bổ sung sau DP-01.
- [docs/TU-01.md](docs/TU-01.md), [docs/TU-02.md](docs/TU-02.md), [docs/TU-03.md](docs/TU-03.md), [docs/TU-04.md](docs/TU-04.md), [docs/TU-05.md](docs/TU-05.md): Tài liệu lịch sử theo từng đợt triển khai.
