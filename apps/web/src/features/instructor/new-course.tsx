"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { coursePath, slugify, type Course } from "./data";
import { Failure } from "./shared";
export function NewCourse() {
  const router = useRouter();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [manual, setManual] = useState(false);
  const [category, setCategory] = useState("General");
  const mutation = useMutation({
    mutationFn: () =>
      api<Course>("/courses", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          slug,
          category: category.trim(),
        }),
      }),
    onSuccess: async (course) => {
      await client.invalidateQueries({ queryKey: ["instructor", "courses"] });
      router.push(`${coursePath(course.id)}/edit/basic`);
    },
  });
  return (
    <>
      <Link href="/instructor/courses">← My Courses</Link>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">START SOMETHING GREAT</p>
          <h1>New Course</h1>
          <p>
            Tạo bản nháp. Bạn có thể hoàn thiện nội dung trước khi xuất bản.
          </p>
        </div>
      </div>
      <form
        className="instructor-panel instructor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mutation.isPending) mutation.mutate();
        }}
      >
        <fieldset disabled={mutation.isPending}>
          <label>
            Tên khóa học
            <input
              required
              maxLength={255}
              pattern=".*\S.*"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!manual) setSlug(slugify(e.target.value));
              }}
              placeholder="Ví dụ: Thiết kế giao diện từ cơ bản"
            />
          </label>
          <label>
            Slug
            <input
              required
              maxLength={255}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => {
                setManual(true);
                setSlug(e.target.value);
              }}
            />
            <small>Chữ thường, số và dấu gạch ngang. Slug phải duy nhất.</small>
          </label>
          <label>
            Danh mục
            <input
              required
              maxLength={100}
              pattern=".*\S.*"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
        </fieldset>
        {mutation.isError && <Failure error={mutation.error} />}
        <div className="instructor-actions">
          <Button type="submit" loading={mutation.isPending}>
            Tạo bản nháp
          </Button>
          <Link href="/instructor/courses">Hủy</Link>
        </div>
      </form>
    </>
  );
}
