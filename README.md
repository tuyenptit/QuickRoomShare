# QuickRoom Share 🚀

Web App Real-time chuyên dụng cho phòng họp, tự host trên Docker với giao diện tối giản sạch sẽ.

---

## 🌟 Tính Năng Cốt Lõi

1. **Đồng Bộ Thời Gian Thực Đa Thiết Bị (Real-time Sync):**

2. **Giao Diện Tinh Gọn (Minimalist UI):**

3. **Kiến Trúc Server & Lưu Trữ:**

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
