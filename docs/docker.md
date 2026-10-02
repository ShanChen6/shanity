# Docker

Xem [hướng dẫn PostgreSQL và Compose](database.md) để tạo `.env`, khởi động database, migration, seed và backend.

```bash
cp .env.example .env
# Sửa PGPASSWORD, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD; sinh JWT_SECRET ngẫu nhiên và cấu hình Auth trong .env.
docker compose up --build -d
docker compose ps
docker compose logs -f migrate api
```

Web: http://localhost:3000; API: http://localhost:4000; kiểm tra DB: `/health/db`.
`WEB_PORT`, `API_PORT`, `PGPORT` đổi cổng host. API trong Compose luôn kết nối `postgres:5432`.

`docker compose down` giữ volume database. Không dùng `down -v` nếu cần giữ dữ liệu.

Xem [Auth](auth.md): local dùng API_NODE_ENV=development; production cần HTTPS và API_NODE_ENV=production.

## Avatar storage

The API uses `AVATAR_STORAGE_DIR=/data/avatars` and the Compose named volume
`avatar_data`. Apply migrations before starting the new API; existing users get
`avatar_key = null`. Back up this volume together with PostgreSQL. Ordinary
container replacement preserves avatars; removing the volume deletes their files.
Uploaded content is excluded from Git and Docker build contexts. See
[Avatar Management](avatar-management.md) for upload limits, public image URLs,
provider replacement and cleanup/reconciliation guidance.
