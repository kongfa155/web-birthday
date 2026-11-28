# Editor React + HTML/CSS + Moveable (DOM Schema v1)

## Công nghệ và chạy ứng dụng

Editor dùng React/React DOM 19.3.1, `react-moveable` (MIT) để kéo/đổi cỡ/xoay
phần tử DOM và `html-to-image` (MIT) để xuất PNG. Hệ thống **không dùng Polotno SDK
và đã bỏ hoàn toàn Fabric cùng dependency liên quan**; không cần API key hay đăng ký trial.
Editor dựng bằng HTML/CSS; xuất PNG dùng raster hóa ngoài màn hình của trình duyệt.

Yêu cầu Node.js 22+. Giữ cấu hình backend `MONGO_URI`, `JWT_SECRET`, `CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GOOGLE_CLIENT_ID` hiện có;
frontend giữ `VITE_API_URL` và `VITE_GOOGLE_CLIENT_ID` (nếu dùng).

```bash
cd webbirthday
npm install
npm run dev
# Terminal khác
cd webbirthday/backend
npm install
npm run dev
```

## Trải nghiệm

Người dùng tạo thiệp mới từ mẫu đã được Admin lưu hoặc tạo thiệp trắng (`blank: true`).
Trong editor có thư viện mẫu sinh nhật dựng sẵn, phần tử chữ, ảnh tải lên,
hình khối, nền và danh sách lớp thật. Thiệp có khổ cố định, thu phóng để vừa màn hình.
Hỗ trợ chỉnh nội dung, kéo, đổi kích thước, xoay, undo/redo (tối đa 60 bước, gom thao tác 600 ms),
lưu và tải PNG. Thiết kế mới dùng một trang; không hỗ trợ animation/video.

Admin tạo mẫu tại `/edit/templates/blank`. Người dùng tạo thiệp từ mẫu sẽ nhận bản
thuộc tài khoản của mình; lưu thiệp không ghi đè mẫu gốc.
`/view/cards/:id` và `/share/:token` là các bộ xem chỉ đọc theo định dạng DOM.

## Dữ liệu và hạn mức tạo thiệp

Hệ thống chỉ hỗ trợ định dạng DOM (`designFormat: "dom"`) với schema phiên bản 1 (`schemaVersion: 1`):

| Trường | Ý nghĩa |
| --- | --- |
| `designUrl` | URL file JSON thiết kế DOM trên Cloudinary |
| `designFormat` | Giá trị `"dom"` |
| `previewUrl` | URL ảnh xem trước toàn bộ thiệp |

`imgURL` chứa URL ảnh thành phần; danh sách ưu tiên `previewUrl` để hiển thị thumbnail.
Không còn hỗ trợ `fabricEdit` hay bộ xem Fabric cũ.

JSON phiên bản 1 (`schemaVersion: 1`) gồm `schemaVersion`, `width`, `height`, `background`, `elements`.
Ba loại phần tử: `text`, `image`, `shape`, kèm vị trí, kích thước, góc xoay,
độ mờ và thuộc tính theo loại. Schema chuẩn nằm trong `shared/designSchema.js`.
Không lưu HTML tùy ý hoặc thực thi script từ thiết kế.

### Giới hạn 20 thiệp và Transaction MongoDB

- Chỉ tài khoản **User** bị giới hạn tối đa **20 thiệp** (`MAX_USER_CARDS = 20`); **Admin** được miễn giới hạn này.
- Khi User tạo thiệp, `createCardWithinQuota` thực hiện trong **MongoDB transaction**:
  1. Tăng trường `users.__v` sẵn có của tài khoản (với `{ timestamps: false }`) làm khóa tuần tự hóa trên document User.
  2. Đếm số thiệp hiện có của `owner` và tạo document `Card` mới ngay trong cùng transaction; trả `409 CARD_LIMIT_REACHED` nếu đã đạt 20 thiệp.
  3. Không thêm index hay trường mới vào schema `User` hoặc `Card`.
- Thao tác upload/save thiết kế lên Cloudinary (`saveDomDesign`) được cache bằng `preparedDesignPromise` bên ngoài callback retry của `withTransaction`, đảm bảo không upload lặp tài nguyên cloud khi transaction tự động thử lại do xung đột ghi.

## API và lưu trữ

POST/PUT card/template nhận `design` (JSON DOM `schemaVersion: 1`), `preview` (PNG base64),
và `cardName`/`name`, `cardDESC` khi cần. Client không được tự chỉ định
`designUrl`, `designFormat` hoặc `previewUrl`; backend sinh các giá trị này.
Tạo thiệp trống qua `POST /api/cards` với `blank: true` và `cardName`;
tạo từ mẫu dùng `templateId` để backend tự kiểm tra mẫu DOM hợp lệ và sao chép nguồn.

Backend kiểm tra tối đa 200 phần tử, khổ thiệp 1–4.096 px, kích thước phần tử
1–8.192 px, ID duy nhất, màu/thuộc tính hợp lệ, URL HTTPS hoặc ảnh raster base64.
Ảnh tải lên qua `/api/upload-base64` (PNG/JPEG/JPG/WebP/GIF) tối đa **5 MiB** mỗi ảnh;
toàn bộ request body theo giới hạn 10 MB. Mỗi lần gửi thiết kế phải có thumbnail mới
và được kiểm tra quyền trước khi upload. Backend không fetch URL tài nguyên bên ngoài do client gửi.

Thiết kế và thumbnail mới được lưu thành tài nguyên Cloudinary riêng, không ghi đè
file của mẫu hoặc người khác. Nếu upload lỗi, bản ghi cũ giữ nguyên.

Link chia sẻ giữ cơ chế token ngẫu nhiên 32 byte, lưu hash SHA-256 (`shareTokenHash`),
kiểm soát quyền theo chủ sở hữu và thu hồi qua `DELETE /api/cards/:id/share`.

## Kiểm thử và trạng thái kiểm chứng

### 1. Kiểm thử cô lập / hồi quy (Mock API, DB, Cloudinary)

```bash
cd webbirthday
npm run lint
npm run build
npm run test:editor
cd backend
npm test
```

- **Backend (`npm test`)**: **87/87** bài đạt (dùng mock Mongoose/Cloudinary, không kết nối DB thật), bao gồm kiểm tra schema DOM, quyền sở hữu, upload 5 MiB, chia sẻ thiệp, thống kê Admin và transaction giới hạn 20 thiệp (`card-quota.test.js`, `admin-statistics.test.js`).
- **Playwright E2E (`npm run test:editor`)**: **17/17** bài đạt (mock API và tài nguyên trình duyệt), kiểm tra lưu/thử lại, mẫu, upload ảnh, zoom/kéo/đổi cỡ/xoay, undo/redo, phím tắt, xuất PNG đúng độ phân giải, mobile và link chia sẻ/thu hồi.
- **Frontend lint & build**: đạt.

Ảnh bên ngoài cần hỗ trợ CORS để xuất PNG. Editor chờ font/ảnh tải xong
và báo lỗi khi không xuất được thay vì tải ảnh trắng.

### 2. Kiểm thử tích hợp thật (Real integration)

- Đã kiểm thử thực tế trên `http://localhost:5000` (backend) và `http://localhost:5173` (frontend) kết nối MongoDB `Webbirthday` và Cloudinary thật từ `.env`.
- Phạm vi dữ liệu kiểm thử được duyệt: 3 tài khoản QA, 23 thiệp, 1 mẫu cùng các tài nguyên mới phát sinh trong lượt kiểm thử.

### 3. CI baseline

- GitHub Actions trên nhánh `dev` tại baseline `399c946` (ngày 27/11/2026) ghi nhận frontend lint/build và backend tests xanh; đây là bằng chứng của mốc baseline trước các thay đổi local hiện tại.

## Rollback

Giữ các trường `designUrl`, `designFormat`, `previewUrl` và tài nguyên thiết kế DOM khi cần quay lui phiên bản. Không có migration để rollback.
