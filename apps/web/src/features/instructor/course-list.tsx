"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/features/auth/session-provider";
import { Button } from "@/components/ui/button";
import { coursePath, mediaUrl, type Course } from "./data";
import { Failure, StatusBadge } from "./shared";
export function CourseList() {
  const { user } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["instructor", "courses"],
    queryFn: ({ signal }) =>
      api<Course[]>("/api/v1/instructor/courses", { signal }),
  });
  const owned = (query.data ?? []).filter(
    (course) => course.ownerId === user?.id,
  );
  const courses = owned.filter(
    (course) =>
      (!status || course.status === status) &&
      `${course.title} ${course.shortDescription ?? ""}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(courses.length / 9));
  const current = Math.min(page, pages);
  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">YOUR TEACHING SPACE</p>
          <h1>My Courses</h1>
          <p>Quản lý nội dung, xây dựng bài học và truyền cảm hứng.</p>
        </div>
        <Link
          className="instructor-primary-link"
          href="/instructor/courses/new"
        >
          ＋ New Course
        </Link>
      </div>
      <div className="instructor-summary">
        <div>
          <strong>{owned.length}</strong>
          <span>Tổng khóa học</span>
        </div>
        <div>
          <strong>
            {owned.filter((c) => c.status === "published").length}
          </strong>
          <span>Đã xuất bản</span>
        </div>
        <div>
          <strong>{owned.filter((c) => c.status === "draft").length}</strong>
          <span>Đang soạn thảo</span>
        </div>
      </div>
      <div className="instructor-filters">
        <label>
          Tìm kiếm
          <input
            type="search"
            placeholder="Tìm theo tên khóa học…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Trạng thái
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {["draft", "published", "archived"].map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isPending ? (
        <p role="status">Đang tải khóa học…</p>
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <p className="instructor-result-count">{courses.length} khóa học</p>
          <div className="instructor-course-grid">
            {courses.slice((current - 1) * 9, current * 9).map((course) => (
              <article className="instructor-course-card" key={course.id}>
                <div className="instructor-cover">
                  {mediaUrl(course.thumbnail) ? (
                    <Image
                      unoptimized
                      fill
                      src={mediaUrl(course.thumbnail)}
                      alt=""
                      sizes="400px"
                    />
                  ) : (
                    <span>
                      ▤<small>Hành trình bắt đầu từ kiến thức</small>
                    </span>
                  )}
                  <StatusBadge status={course.status} />
                </div>
                <div className="instructor-card-body">
                  <p className="instructor-eyebrow">
                    {course.category || "General"} ·{" "}
                    {course.level || "Beginner"}
                  </p>
                  <h2>
                    <Link href={`${coursePath(course.id)}/edit/basic`}>
                      {course.title}
                    </Link>
                  </h2>
                  <p>
                    {course.shortDescription ||
                      "Thêm mô tả ngắn để giới thiệu khóa học của bạn."}
                  </p>
                  <div className="instructor-card-actions">
                    <Link href={`${coursePath(course.id)}/edit/basic`}>
                      Chỉnh sửa →
                    </Link>
                    <Link href={`${coursePath(course.id)}/preview`}>
                      Xem trước
                    </Link>
                    <Link href={`${coursePath(course.id)}/progress`}>
                      Học viên
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!courses.length && (
            <div className="instructor-empty">
              <h2>
                {owned.length
                  ? "Không có kết quả phù hợp"
                  : "Khóa học đầu tiên của bạn"}
              </h2>
              <p>
                {owned.length
                  ? "Thử đổi từ khóa hoặc bộ lọc."
                  : "Bắt đầu bằng một ý tưởng, rồi xây dựng từng bài học."}
              </p>
              <Link href="/instructor/courses/new">Tạo khóa học mới →</Link>
            </div>
          )}
          <nav className="instructor-pagination" aria-label="Phân trang">
            <Button
              variant="outline"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Trước
            </Button>
            <span>
              Trang {current} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Sau
            </Button>
          </nav>
        </>
      )}
    </>
  );
}
