# QuickRoom Share 🚀

Web App Real-time chuyên dụng cho phòng họp, tự host trên Docker với giao diện tối giản sạch sẽ.

---

## 🌟 Tính Năng Cốt Lõi

1. **Đồng Bộ Thời Gian Thực Đa Thiết Bị (Real-time Sync):**
   - Cơ chế kết hợp **Server-Sent Events (SSE)** và **Smart-Polling thông minh (chu kỳ 1.8s)**:
     + Bất kỳ ai dán/sửa text: Toàn bộ máy chiếu, laptop và điện thoại cập nhật tức thì.
     + Bất kỳ ai tải file hoặc dán ảnh (`Ctrl + V`): Màn hình các máy khác lập tức hiển thị file/ảnh mới mà **KHÔNG cần bấm F5 / tải lại trang**.
     + Hoạt động bền bỉ, không bị đứt kết nối qua proxy, Cloud Run hoặc tường lửa mạng công ty.

2. **Giao Diện Tinh Gọn (Minimalist UI):**
   - **Header:**
     + Logo + Chữ: **QuickRoom Share**.
     + Tên phòng hiện tại (ví dụ: `#hop-giao-ban`), nút **"Sao chép link"**, nút **"Mã QR"** để quét camera từ điện thoại, nút **"Xóa phòng"**.
     + Tuyệt đối không có khẩu hiệu hay mô tả tiếp thị thừa.
   - **Khu vực Ghi chú (Notepad):**
     + Chiếm trọn nửa màn hình hoặc tự co giãn.
     + Placeholder: `"Nhập hoặc dán nội dung tại đây (link họp, văn bản, ghi chú)..."`
     + Nhận diện hyperlink và cho phép bấm mở tab mới trực tiếp.
   - **Khu vực Upload & Trình chiếu:**
     + Khung nét đứt mảnh: `"Kéo thả tệp hoặc chọn file"` / `"Hỗ trợ Ctrl + V dán ảnh"`.
     + Khi chưa có file: Hiện dòng mờ `"Chưa có tệp nào"`.
     + **Chiếu Backdrop toàn màn hình (Máy chiếu)**: Click vào ảnh để mở Lightbox nền đen tuyệt đối, ảnh scale fit màn hình, phím mũi tên `←` `→` chuyển ảnh, phím `Esc` thoát.
     + Tải từng file hoặc nút **"Tải tất cả (.zip)"**.

3. **Kiến Trúc Server & Lưu Trữ:**
   - **Database:** SQLite (`/app/data/app.db`) lưu Room và Text.
   - **Storage:** Lưu trực tiếp file/ảnh vào thư mục cục bộ (`/app/uploads/[roomId]/...`).
   - **Auto-Cleanup Worker:** Tự động quét và xóa file/phòng cũ hơn `FILE_TTL_HOURS` (mặc định 12 giờ) mỗi 30 phút.
   - **Kích thước upload tối đa:** Hỗ trợ tới **200MB** (`MAX_FILE_SIZE_MB`).

---

## 🐳 Triển Khai Docker & Docker Compose

### 1. Khởi chạy bằng Docker Compose:
```bash
docker compose up -d --build
```

Ứng dụng khởi chạy tại: `http://localhost:3000`

### 2. File `docker-compose.yml`:
```yaml
services:
  quickroom-share:
    build:
      context: .
      dockerfile: Dockerfile
    image: quickroom-share:latest
    container_name: quickroom-share
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - DATABASE_PATH=/app/data/app.db
      - UPLOAD_DIR=/app/uploads
      - FILE_TTL_HOURS=12
      - MAX_FILE_SIZE_MB=200
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    deploy:
      resources:
        limits:
          cpus: "1.5"
          memory: 1024M
        reservations:
          memory: 256M
```

### 3. Xem nhật ký hệ thống:
```bash
docker compose logs -f
```

---

## 💻 Chạy Trực Tiếp Với Node.js

```bash
npm install
npm run build
npm start
```
