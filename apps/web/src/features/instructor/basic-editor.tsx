"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useCourse, useSaveCourse, mediaUrl, type Course } from "./data";
import { EditNav, Failure, Notice, StatusBadge } from "./shared";
export function BasicEditor({ id }: { id: string }) {
  const query = useCourse(id);
  if (query.isPending) return <p role="status">Đang tải khóa học…</p>;
  if (query.isError)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  return <BasicForm key={id} course={query.data} />;
}
function BasicForm({ course }: { course: Course }) {
  const [values, setValues] = useState({
    title: course.title,
    slug: course.slug,
    shortDescription: course.shortDescription ?? "",
    description: course.description ?? "",
    thumbnail: course.thumbnail ?? "",
    category: course.category ?? "General",
    level: course.level ?? "Beginner",
    language: course.language ?? "vi",
    price: course.price ?? 0,
    isSequential: course.isSequential ?? false,
  });
  const [paid, setPaid] = useState(course.price > 0);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const save = useSaveCourse(course.id);
  const busy = uploading || save.isPending;
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  function field<K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setNotice("");
  }
  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    setNotice("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        !file.size ||
        file.size > 2 * 1024 * 1024
      )
        throw new Error("Chọn JPEG, PNG hoặc WebP, tối đa 2 MB.");
      const body = new FormData();
      body.append("file", file);
      const result = await api<{ url: string }>(
        `/courses/${course.id}/thumbnail`,
        { method: "POST", body },
      );
      field("thumbnail", result.url);
    } catch (error) {
      setUploadError(error);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">COURSE EDITOR</p>
          <h1>{course.title}</h1>
        </div>
        <StatusBadge status={course.status} />
      </div>
      <EditNav id={course.id} active="basic" />
      <form
        className="instructor-panel instructor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy)
            save.mutate(
              {
                ...values,
                title: values.title.trim(),
                category: values.category.trim(),
                price: paid ? values.price : 0,
              },
              {
                onSuccess: () => {
                  setDirty(false);
                  setNotice("Đã lưu thông tin khóa học.");
                },
              },
            );
        }}
      >
        <h2>Thông tin cơ bản</h2>
        <p>
          Nội dung này giúp học viên hiểu khóa học và lựa chọn đúng hành trình.
        </p>
        <fieldset disabled={busy}>
          <label>
            Tên khóa học
            <input
              required
              maxLength={255}
              pattern=".*\S.*"
              value={values.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </label>
          <label>
            Slug
            <input
              required
              maxLength={255}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={values.slug}
              onChange={(e) => field("slug", e.target.value)}
            />
          </label>
          <label>
            Mô tả ngắn
            <textarea
              rows={2}
              maxLength={500}
              value={values.shortDescription}
              onChange={(e) => field("shortDescription", e.target.value)}
            />
          </label>
          <label>
            Mô tả đầy đủ (Markdown)
            <textarea
              rows={10}
              maxLength={100000}
              value={values.description}
              onChange={(e) => field("description", e.target.value)}
            />
            <small>
              Hỗ trợ tiêu đề #, danh sách - và đoạn văn. Xem kết quả tại tab Xem
              trước.
            </small>
          </label>
          <label>
            Ảnh bìa
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
            <small>
              JPEG, PNG hoặc WebP; tối đa 2 MB, 16 megapixel. Nhấn Lưu để áp
              dụng ảnh.
            </small>
          </label>
          {mediaUrl(values.thumbnail) && (
            <div className="instructor-thumbnail">
              <Image
                unoptimized
                width={512}
                height={288}
                src={mediaUrl(values.thumbnail)}
                alt="Ảnh bìa khóa học"
              />
              <Button variant="outline" onClick={() => field("thumbnail", "")}>
                Xóa ảnh
              </Button>
            </div>
          )}
          <div className="instructor-form-grid">
            <label>
              Danh mục
              <input
                required
                maxLength={100}
                pattern=".*\S.*"
                value={values.category}
                onChange={(e) => field("category", e.target.value)}
              />
            </label>
            <label>
              Trình độ
              <select
                value={values.level}
                onChange={(e) => field("level", e.target.value)}
              >
                {["Beginner", "Intermediate", "Advanced"].map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </label>
            <label>
              Ngôn ngữ
              <input
                required
                minLength={2}
                maxLength={35}
                value={values.language}
                onChange={(e) => field("language", e.target.value)}
                placeholder="vi, en…"
              />
            </label>
            <label>
              Học phí
              <select
                value={paid ? "paid" : "free"}
                onChange={(e) => {
                  setPaid(e.target.value === "paid");
                  setDirty(true);
                }}
              >
                <option value="free">Miễn phí</option>
                <option value="paid">Có phí</option>
              </select>
            </label>
            {paid && (
              <label>
                Giá (VND)
                <input
                  type="number"
                  required
                  min={1}
                  max={2147483647}
                  step={1}
                  value={values.price}
                  onChange={(e) => field("price", Number(e.target.value))}
                />
              </label>
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>Lộ trình học</legend>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={values.isSequential}
              onChange={(e) => field("isSequential", e.target.checked)}
            />
            <span>
              Học tuần tự
              <small className="block text-muted">
                Học viên phải hoàn thành các bài bắt buộc theo thứ tự trước khi
                mở bài tiếp theo. Bài tùy chọn và bài xem thử không bị khóa.
              </small>
            </span>
          </label>
        </fieldset>
        {uploading && <p role="status">Đang tải ảnh lên…</p>}
        {uploadError instanceof Error && (
          <p role="alert" className="instructor-error">
            {uploadError.message}
          </p>
        )}
        {save.isError && <Failure error={save.error} />}
        <div className="instructor-save-bar">
          <span>{dirty ? "Có thay đổi chưa lưu" : "Thông tin đã lưu"}</span>
          <Button type="submit" disabled={uploading} loading={save.isPending}>
            Lưu thay đổi
          </Button>
        </div>
        <Notice>{notice}</Notice>
      </form>
    </>
  );
}
