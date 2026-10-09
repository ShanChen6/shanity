"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiError, api, errorMessage } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import { learningPath } from "../learning-model";

export function LessonLockedState({
  courseId,
  courseSlug,
  lessonSlug,
  isAuthenticated,
  isStudent,
}: {
  courseId: string;
  courseSlug: string;
  lessonSlug: string;
  isAuthenticated: boolean;
  isStudent: boolean;
}) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const enroll = useMutation({
    mutationFn: () =>
      api(`/api/v1/student/courses/${courseId}/enroll`, { method: "POST" }),
    onSettled: (_data, failure) => {
      // "Already enrolled" (409) also means access should be re-evaluated.
      if (!failure || (failure instanceof ApiError && failure.status === 409))
        return client.invalidateQueries({ queryKey: ["learn"] });
      setError(errorMessage(failure));
    },
  });

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center"
    >
      <span aria-hidden="true" className="text-4xl">
        🔒
      </span>
      <h2 className="text-xl font-semibold">Khóa học này yêu cầu Đăng ký</h2>
      <p className="text-sm text-muted">
        {isAuthenticated
          ? "Hãy đăng ký khóa học để mở khóa bài học này."
          : "Đăng nhập và đăng ký khóa học để xem bài học này."}
      </p>
      {isAuthenticated ? (
        isStudent && (
          <Button
            loading={enroll.isPending}
            loadingLabel="Đang đăng ký…"
            onClick={() => {
              setError("");
              enroll.mutate();
            }}
          >
            Enroll Now
          </Button>
        )
      ) : (
        <Link
          href={loginUrl(learningPath(courseSlug, lessonSlug))}
          className="inline-flex control items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Đăng nhập
        </Link>
      )}
      {error && (
        <p role="status" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Link
        href={`/courses/${courseSlug}`}
        className="text-sm text-primary underline"
      >
        Xem thông tin khóa học
      </Link>
    </div>
  );
}
