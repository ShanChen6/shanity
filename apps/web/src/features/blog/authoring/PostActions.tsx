"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/providers/toast-provider";
import { blogErrorMessage, deletePost, postKeys, runPostAction } from "./api";
import { permissionsFor } from "./status";
import type { AuthoredPost, PostAction } from "./types";

type Step = PostAction | "delete";

const STEPS: Record<
  Step,
  {
    label: string;
    done: string;
    variant: "primary" | "outline" | "danger";
    /** Asks before acting; `note` adds a note field (required for reject). */
    confirm?: { title: string; description: string; note?: "optional" | "required" };
  }
> = {
  submit: {
    label: "Gửi duyệt",
    done: "Đã gửi bài cho quản trị viên duyệt.",
    variant: "primary",
    confirm: {
      title: "Gửi bài để duyệt?",
      description:
        "Trong lúc chờ duyệt bạn không sửa được bài. Bạn có thể rút lại bất cứ lúc nào để sửa tiếp.",
    },
  },
  withdraw: {
    label: "Rút lại để sửa",
    done: "Đã rút bài về bản nháp.",
    variant: "outline",
  },
  publish: {
    label: "Duyệt & xuất bản",
    done: "Bài đã được xuất bản lên blog.",
    variant: "primary",
    confirm: {
      title: "Xuất bản bài viết?",
      description: "Bài sẽ hiển thị công khai trên blog ngay sau khi xuất bản.",
      note: "optional",
    },
  },
  reject: {
    label: "Trả lại",
    done: "Đã trả bài về cho tác giả.",
    variant: "outline",
    confirm: {
      title: "Trả bài về cho tác giả?",
      description: "Bài quay về bản nháp. Tác giả sẽ thấy ghi chú của bạn để sửa.",
      note: "required",
    },
  },
  hide: {
    label: "Ẩn khỏi blog",
    done: "Đã ẩn bài khỏi blog.",
    variant: "danger",
    confirm: {
      title: "Ẩn bài khỏi blog?",
      description: "Bài sẽ không còn hiển thị công khai. Thao tác được ghi nhật ký.",
      note: "optional",
    },
  },
  delete: {
    label: "Xóa",
    done: "Đã xóa bản nháp.",
    variant: "danger",
    confirm: {
      title: "Xóa bản nháp?",
      description: "Bản nháp sẽ bị xóa vĩnh viễn và không thể khôi phục.",
    },
  },
};

const ORDER: Step[] = ["withdraw", "reject", "hide", "delete", "submit", "publish"];

/**
 * The workflow buttons a viewer may use on a post. `beforeSubmit` lets the
 * editor save unsaved changes first; `onDeleted` leaves a deleted post's page.
 */
export function PostActions({
  post,
  viewer,
  size = "sm",
  beforeSubmit,
  onDeleted,
  disabled,
}: {
  post: AuthoredPost;
  viewer: { id: string; isAdmin: boolean };
  size?: "sm" | "md";
  beforeSubmit?: () => Promise<void>;
  onDeleted?: () => void;
  disabled?: boolean;
}) {
  const allowed = permissionsFor(post, viewer);
  const client = useQueryClient();
  const toasts = useToast();
  const [asking, setAsking] = useState<Step | null>(null);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async ({ step, note }: { step: Step; note?: string }) => {
      if (step === "delete") return deletePost(post.id);
      if (step === "submit" && beforeSubmit) await beforeSubmit();
      return runPostAction(post.id, step, note);
    },
    onSuccess: (result, { step }) => {
      toasts.success(STEPS[step].done);
      setAsking(null);
      setNote("");
      if (result) client.setQueryData(postKeys.detail(post.id), result);
      else client.removeQueries({ queryKey: postKeys.detail(post.id) });
      void client.invalidateQueries({ queryKey: postKeys.all });
      if (step === "delete") onDeleted?.();
    },
    onError: (error) => toasts.error(blogErrorMessage(error)),
  });

  const steps = ORDER.filter((step) =>
    step === "delete" ? allowed.remove : allowed[step],
  );
  if (!steps.length) return null;
  const current = asking ? STEPS[asking] : null;
  const noteMissing = current?.confirm?.note === "required" && !note.trim();

  return (
    <>
      {steps.map((step) => (
        <Button
          key={step}
          size={size}
          variant={STEPS[step].variant}
          disabled={disabled || mutation.isPending}
          loading={mutation.isPending && mutation.variables?.step === step}
          onClick={() =>
            STEPS[step].confirm ? setAsking(step) : mutation.mutate({ step })
          }
        >
          {STEPS[step].label}
        </Button>
      ))}
      {asking && current?.confirm && (
        <Dialog
          title={current.confirm.title}
          description={current.confirm.description}
          busy={mutation.isPending}
          onClose={() => {
            setAsking(null);
            setNote("");
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!noteMissing) mutation.mutate({ step: asking, note });
            }}
          >
            {current.confirm.note && (
              <FormField
                label={
                  current.confirm.note === "required"
                    ? "Ghi chú cho tác giả (bắt buộc)"
                    : "Ghi chú (không bắt buộc)"
                }
                description="Tối đa 2.000 ký tự."
              >
                {(field) => (
                  <Textarea
                    {...field}
                    autoFocus
                    maxLength={2000}
                    required={current.confirm?.note === "required"}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                )}
              </FormField>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => {
                  setAsking(null);
                  setNote("");
                }}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant={current.variant === "danger" ? "danger" : "primary"}
                disabled={noteMissing}
                loading={mutation.isPending}
              >
                {current.label}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
