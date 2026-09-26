# Docker

Xem [hướng dẫn PostgreSQL và Compose](database.md) để tạo `.env`, khởi động database, migration, seed và backend.

```bash
cp .env.example .env
# Sửa PGPASSWORD trong .env trước khi chạy.
docker compose up --build -d
docker compose ps
docker compose logs -f migrate api
```

Web: http://localhost:3000; API: http://localhost:4000; kiểm tra DB: `/health/db`.
`WEB_PORT`, `API_PORT`, `PGPORT` đổi cổng host. API trong Compose luôn kết nối `postgres:5432`.

`docker compose down` giữ volume database. Không dùng `down -v` nếu cần giữ dữ liệu.
