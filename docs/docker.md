## Chạy bằng Docker

### Yêu cầu

- Docker Engine có kèm Compose plugin (`docker compose`).

### Khởi động

Từ thư mục gốc của repository:

```bash
docker compose up --build -d
```

Sau khi container chạy xong:

- Web app: http://localhost:3000
- API: http://localhost:4000 (endpoint kiểm tra nhanh: `GET /`)

### Thay đổi cổng (port)

Mặc định web dùng cổng `3000`, API dùng cổng `4000` trên máy host. Nếu muốn đổi:

1. Copy file mẫu:

```bash
   cp .env.example .env
```

2. Sửa `WEB_PORT` và/hoặc `API_PORT` trong `.env`.

Lưu ý: đây chỉ là cổng ánh xạ ra host. Bên trong container, ứng dụng vẫn luôn chạy ở `3000` (web) và `4000` (API), không đổi.

### Theo dõi log và dừng ứng dụng

```bash
# Xem log realtime
docker compose logs -f

# Dừng và gỡ container
docker compose down
```

### Ghi chú về build

- Docker build sử dụng file lockfile `pnpm` ở thư mục gốc và build cả hai app trong workspace.
- Hiện tại repo **chưa có** database service hay biến môi trường riêng cho ứng dụng. Khi triển khai các tính năng cần đến (ví dụ: kết nối DB), cần bổ sung:
  - Service database trong `docker-compose.yml`.
  - Các biến môi trường tương ứng vào `.env.example` / `.env`.
