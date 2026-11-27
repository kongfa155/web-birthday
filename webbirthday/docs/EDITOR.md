# Editor React + HTML/CSS + Moveable

## Công nghệ và chạy ứng dụng

Editor dùng React/React DOM 19.3.1, `react-moveable` (MIT) để kéo/đổi cỡ/xoay
phần tử DOM và `html-to-image` (MIT) để xuất PNG. Không dùng Polotno SDK,
không cần API key hay đăng ký trial. Fabric chỉ phục vụ bộ xem thiệp cũ.
Editor dựng bằng HTML/CSS; xuất PNG dùng raster hóa ngoài màn hình của trình duyệt.

Yêu cầu Node.js 22+. Giữ cấu hình backend `MONGO_URI`, `JWT_SECRET`, `CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` hiện có; frontend giữ `VITE_API_URL`
(nếu có). Không cần biến môi trường mới.

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

Người dùng chọn “Tạo thiệp từ mẫu”, sau đó bắt đầu thiệp mới hoặc chọn mẫu
đã được admin lưu. Trong editor có thư viện mẫu sinh nhật dựng sẵn, chữ,
ảnh tải lên, hình khối, nền và danh sách lớp thật. Thiệp có khổ cố định,
thu phóng để vừa màn hình. Chỉnh nội dung, kéo, đổi kích thước, xoay, undo/redo,
lưu và tải PNG. Thiết kế mới dùng một trang; không hỗ trợ animation/video.

Admin tạo mẫu tại `/edit/templates/blank`. Người dùng tạo thiệp từ mẫu sẽ
nhận bản thuộc tài khoản của mình; lưu thiệp không ghi đè mẫu gốc.
`/view/cards/:id` và `/share/:token` là các bộ xem chỉ đọc.

## Dữ liệu

Ba trường tùy chọn đã được phê duyệt vào Card và Template:

| Trường | Ý nghĩa |
| --- | --- |
| `designUrl` | URL file JSON thiết kế DOM trên Cloudinary |
| `designFormat` | `dom` cho thiết kế mới |
| `previewUrl` | URL ảnh xem trước toàn bộ thiệp |

Giữ `fabricEdit`/`imgURL` cho dữ liệu cũ. Với thiết kế mới `imgURL` chứa
URL ảnh thành phần; danh sách ưu tiên `previewUrl` để hiển thị thumbnail.
Không tạo index, chạy migration, xóa hoặc chuyển đổi record cũ.
Các trường mới được ghi khi người dùng tạo/lưu thiệp qua thao tác CRUD bình thường.
Thiệp Fabric cũ vẫn xem được; chưa có chuyển đổi tự động có thể làm sai bố cục.

JSON phiên bản 1 gồm `schemaVersion`, `width`, `height`, `background`, `elements`.
Ba loại phần tử: `text`, `image`, `shape`, kèm vị trí, kích thước, góc xoay,
độ mờ và thuộc tính theo loại. Schema chuẩn trong `shared/designSchema.js`.
Không lưu HTML tùy ý hoặc thực thi script từ thiết kế.

## API và lưu trữ

POST/PUT card/template nhận `design` (JSON nói trên), `preview` (PNG base64),
và `cardName`/`name`, `cardDESC` khi cần. Client không được tự chỉ định
`designUrl`, `designFormat` hoặc `previewUrl`; backend sinh các giá trị này.
Tạo thiệp trống của mình qua POST `/api/cards` với `blank: true` và `cardName`.
Tạo từ mẫu tiếp tục dùng `templateId` để backend tự đọc nguồn.

Backend kiểm tra tối đa 200 phần tử, khổ thiệp 1–4.096 px, kích thước phần tử
1–8.192 px, ID duy nhất, màu/thuộc tính hợp lệ, URL HTTPS hoặc ảnh raster base64.
Ảnh base64 tối đa 5 MB; toàn bộ request theo giới hạn 10 MB hiện có.
Mỗi lần gửi thiết kế phải có thumbnail mới. Kiểm tra quyền trước khi upload.
Backend không fetch URL tài nguyên bên ngoài do client gửi.

Ảnh tải lên qua `/api/upload-base64` có xác thực. Thiết kế và thumbnail mới
được lưu thành tài nguyên Cloudinary riêng, không ghi đè file của mẫu hoặc
người khác. Nếu upload lỗi, record cũ giữ nguyên. Có thể còn file không được
tham chiếu nếu bước upload sau hoặc ghi database lỗi; chưa có tác vụ dọn file
vì tài nguyên có thể được dùng chung.

Link chia sẻ giữ cơ chế token ngẫu nhiên, hash, kiểm soát quyền và thu hồi
hiện có. Thiết kế được chia sẻ dùng bộ xem theo định dạng.

## Kiểm thử

```bash
cd webbirthday
npm run build
npm run lint
cd backend
npm test
```

Kiểm thử trình duyệt (mock API, không ghi Cloudinary hoặc database thật):

```bash
cd webbirthday
npx playwright install chromium
npm run test:editor
```

Có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` để dùng Chromium đã cài sẵn.
Các bài kiểm tra bao gồm lưu/thử lại, không ghi đè khi tải lỗi, chỉnh chữ,
kéo/đổi cỡ/xoay ở mức zoom, undo/redo, tạo mẫu lần đầu, upload/đặt ảnh,
ảnh hỏng, xuất PNG đúng độ phân giải, mobile và link chia sẻ/thu hồi.

Backend tests dùng mock, không kết nối hoặc sửa database thật.
`backend/tests/design.test.js` kiểm tra schema, lưu, quyền, lỗi Cloudinary,
sao chép mẫu và DTO chia sẻ. Kiểm thử trình duyệt cần thêm: tạo từ mẫu,
sửa tiếng Việt, kéo/đổi cỡ/xoay ở các mức zoom, upload/crop ảnh, undo/redo,
lưu/tải lại, PNG, mobile, lỗi mạng, thiệp Fabric và link đã thu hồi.

Ảnh bên ngoài cần hỗ trợ CORS để xuất PNG. Editor chờ font/ảnh tải xong
và báo lỗi khi không xuất được thay vì tải ảnh trắng.

## Rollback

Giữ các trường mới và file thiết kế khi quay lại bản cũ. Không đổi `designUrl`
thành `fabricEdit`: hai định dạng không tương thích. Muốn tiếp tục xem các
thiệp DOM đã tạo, cần giữ backend và bộ xem DOM của bản này. Không xóa dữ liệu
hoặc tự chuyển ngược sang Fabric. Không có migration để rollback.
