"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/session-provider";
import { useToast } from "@/providers/toast-provider";
import {
  blogErrorMessage,
  createCategory,
  createPost,
  fetchCategories,
  fetchPost,
  postKeys,
  runPostAction,
  updatePost,
  uploadImage,
  IMAGE_TYPES,
} from "./api";
import { blogImageUrl } from "../image-url";
import { DocumentImport } from "./DocumentImport";
import { MarkdownEditor } from "./MarkdownEditor";
import { PostActions } from "./PostActions";
import { STATUS_LABELS, formatDate, permissionsFor } from "./status";
import type { AuthoredPostDetail, PostInput } from "./types";

// Limits from apps/api blog.dto.ts.
const TITLE_MAX = 200;
const EXCERPT_MAX = 500;
const CONTENT_MAX = 100_000;
const SLUG_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";

type Form = {
  title: string;
  slug: string;
  categoryId: string;
  excerpt: string;
  coverImage: string;
  content: string;
};

const EMPTY: Form = { title: "", slug: "", categoryId: "", excerpt: "", coverImage: "", content: "" };

const formOf = (post: AuthoredPostDetail): Form => ({
  title: post.title,
  slug: post.slug,
  categoryId: post.category?.id ?? "",
  excerpt: post.excerpt ?? "",
  coverImage: post.coverImage ?? "",
  content: post.content,
});

const inputOf = (form: Form): PostInput => ({
  title: form.title.trim(),
  content: form.content,
  excerpt: form.excerpt.trim() || null,
  coverImage: form.coverImage.trim() || null,
  categoryId: form.categoryId || null,
});

/** Writes a new post (no `postId`) or edits one. */
export function PostEditor({ basePath, postId }: { basePath: string; postId?: string }) {
  const query = useQuery({
    queryKey: postKeys.detail(postId ?? "new"),
    queryFn: ({ signal }) => fetchPost(postId!, signal),
    enabled: Boolean(postId),
  });

  if (!postId) return <EditorForm basePath={basePath} />;
  if (query.isPending)
    return (
      <div role="status" aria-busy="true" aria-label="Đang tải bài viết" className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (query.error)
    return (
      <div className="space-y-4">
        <Alert tone="danger">{blogErrorMessage(query.error)}</Alert>
        <Link href={basePath} className="text-sm font-medium text-primary hover:underline">
          ← Quay lại danh sách bài viết
        </Link>
      </div>
    );
  // Remount on each server version so the form starts from what was saved.
  return <EditorForm key={query.data.updatedAt} basePath={basePath} post={query.data} />;
}

function EditorForm({ basePath, post }: { basePath: string; post?: AuthoredPostDetail }) {
  const router = useRouter();
  const client = useQueryClient();
  const toasts = useToast();
  const { user } = useSession();
  const viewer = { id: user?.id ?? "", isAdmin: user?.roles.includes("admin") ?? false };
  const initial = post ? formOf(post) : EMPTY;
  const [form, setForm] = useState<Form>(initial);
  const [error, setError] = useState("");

  const allowed = post ? permissionsFor(post, viewer) : null;
  const editable = !post || allowed!.edit;
  const slugFrozen = Boolean(post?.publishedAt);
  const dirty = (Object.keys(form) as Array<keyof Form>).some((key) => form[key] !== initial[key]);
  const set = (key: keyof Form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const categories = useQuery({
    queryKey: postKeys.categories,
    queryFn: ({ signal }) => fetchCategories(signal),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async ({ thenSubmit }: { thenSubmit: boolean }) => {
      const input = inputOf(form);
      const slug = form.slug.trim();
      let saved: AuthoredPostDetail;
      if (!post) saved = await createPost(slug ? { ...input, slug } : input);
      else
        saved = await updatePost(post.id, {
          ...input,
          ...(slug && slug !== post.slug && !slugFrozen ? { slug } : {}),
        });
      if (thenSubmit) {
        // Saved first: a failed submit still keeps the draft.
        try {
          saved = await runPostAction(saved.id, "submit");
        } catch (cause) {
          client.setQueryData(postKeys.detail(saved.id), saved);
          throw Object.assign(cause as object, { savedId: saved.id });
        }
      }
      return saved;
    },
    onSuccess: (saved, { thenSubmit }) => {
      setError("");
      client.setQueryData(postKeys.detail(saved.id), saved);
      void client.invalidateQueries({ queryKey: postKeys.all });
      toasts.success(thenSubmit ? "Đã lưu và gửi bài cho quản trị viên duyệt." : "Đã lưu bài viết.");
      if (thenSubmit) router.push(basePath);
      else if (!post) router.replace(`${basePath}/${saved.id}/edit`);
    },
    onError: (cause) => {
      const message = blogErrorMessage(cause);
      setError(message);
      toasts.error(message);
      // A new post was created even though submitting it failed: edit it.
      const savedId = (cause as { savedId?: string }).savedId;
      if (!post && savedId) router.replace(`${basePath}/${savedId}/edit`);
    },
  });

  const status = post ? STATUS_LABELS[post.status] : STATUS_LABELS.DRAFT;

  return (
    <div className="space-y-6">
      <Link href={basePath} className="text-sm font-medium text-primary hover:underline">
        ← Danh sách bài viết
      </Link>
      <PageHeader
        title={post ? post.title || "Bài viết" : "Viết bài mới"}
        description={
          post ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              <span>
                {viewer.isAdmin && !allowed?.own ? `${post.author.name} · ` : ""}
                Cập nhật {formatDate(post.updatedAt)}
              </span>
              {post.status === "PUBLISHED" && (
                <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="text-primary hover:underline">
                  Xem trên blog
                </Link>
              )}
            </span>
          ) : (
            "Bài mới được lưu thành bản nháp. Khi hoàn thiện, gửi duyệt để quản trị viên xuất bản lên blog."
          )
        }
      />

      {post?.review?.note && (
        <Alert
          tone={post.status === "DRAFT" ? "warning" : "info"}
          title={post.status === "DRAFT" ? "Bài được trả lại để chỉnh sửa" : "Ghi chú kiểm duyệt"}
        >
          <p className="mt-1 whitespace-pre-wrap">{post.review.note}</p>
          <p className="mt-1 text-xs opacity-80">
            {post.review.by.name} · {formatDate(post.review.at)}
          </p>
        </Alert>
      )}
      {post && !editable && (
        <Alert tone="info">
          {post.status === "PENDING_REVIEW"
            ? "Bài đang chờ duyệt nên tạm thời không sửa được. Rút lại nếu bạn muốn sửa tiếp."
            : "Bài đã gửi đi nên bạn không thể sửa trực tiếp. Liên hệ quản trị viên nếu cần thay đổi."}
        </Alert>
      )}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending) save.mutate({ thenSubmit: false });
        }}
      >
        <fieldset disabled={!editable || save.isPending} className="space-y-5">
          <FormField label="Tiêu đề">
            {(field) => (
              <Input
                {...field}
                required
                maxLength={TITLE_MAX}
                pattern=".*\S.*"
                value={form.title}
                onChange={(event) => set("title")(event.target.value)}
                placeholder="Ví dụ: 5 mẹo giải nhanh phương trình bậc hai"
              />
            )}
          </FormField>

          <div className="grid gap-5 md:grid-cols-2">
            <CategoryField
              value={form.categoryId}
              onChange={set("categoryId")}
              categories={categories.data ?? []}
              loading={categories.isPending}
              canCreate={viewer.isAdmin}
            />
            <FormField
              label="Đường dẫn (slug)"
              description={
                slugFrozen
                  ? "Bài đã xuất bản nên đường dẫn được giữ cố định."
                  : "Để trống để tự tạo từ tiêu đề. Chữ thường, số và dấu gạch ngang."
              }
            >
              {(field) => (
                <Input
                  {...field}
                  pattern={SLUG_PATTERN}
                  maxLength={200}
                  disabled={slugFrozen}
                  value={form.slug}
                  onChange={(event) => set("slug")(event.target.value)}
                  placeholder="tu-dong-tao-tu-tieu-de"
                />
              )}
            </FormField>
          </div>

          <FormField label="Tóm tắt (không bắt buộc)" description="Hiện ở danh sách bài và khi chia sẻ link.">
            {(field) => (
              <Textarea
                {...field}
                className="min-h-20"
                maxLength={EXCERPT_MAX}
                value={form.excerpt}
                onChange={(event) => set("excerpt")(event.target.value)}
              />
            )}
          </FormField>

          <CoverField value={form.coverImage} onChange={set("coverImage")} />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="post-content" className="text-sm font-medium">
                Nội dung
              </label>
              <DocumentImport
                hasContent={Boolean(form.content.trim())}
                disabled={!editable || save.isPending}
                onImport={(draft, mode) =>
                  setForm((current) => ({
                    ...current,
                    title: current.title.trim() || !draft.title ? current.title : draft.title,
                    content:
                      mode === "append" && current.content.trim()
                        ? `${current.content.trimEnd()}\n\n${draft.content}`
                        : draft.content,
                  }))
                }
              />
            </div>
            <MarkdownEditor
              id="post-content"
              value={form.content}
              onChange={set("content")}
              maxLength={CONTENT_MAX}
              disabled={!editable || save.isPending}
            />
          </div>
        </fieldset>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {dirty && editable && <span className="mr-auto text-sm text-muted">Có thay đổi chưa lưu</span>}
          {post && (
            <PostActions
              post={post}
              viewer={viewer}
              size="md"
              disabled={save.isPending}
              beforeSubmit={
                dirty
                  ? async () => {
                      await save.mutateAsync({ thenSubmit: false });
                    }
                  : undefined
              }
              onDeleted={() => router.push(basePath)}
            />
          )}
          {editable && (
            <>
              <Button type="submit" variant="outline" loading={save.isPending && !save.variables?.thenSubmit}>
                {post ? "Lưu thay đổi" : "Lưu bản nháp"}
              </Button>
              {!post && (
                <Button
                  loading={save.isPending && save.variables?.thenSubmit}
                  disabled={save.isPending}
                  onClick={(event) => {
                    const element = event.currentTarget.form;
                    if (element && !element.reportValidity()) return;
                    save.mutate({ thenSubmit: true });
                  }}
                >
                  Lưu & gửi duyệt
                </Button>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function CategoryField({
  value,
  onChange,
  categories,
  loading,
  canCreate,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: Array<{ id: string; name: string }>;
  loading: boolean;
  canCreate: boolean;
}) {
  const client = useQueryClient();
  const toasts = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createCategory(name),
    onSuccess: (category) => {
      client.setQueryData(postKeys.categories, (current: typeof categories | undefined) =>
        [...(current ?? []), category].sort((a, b) => a.name.localeCompare(b.name, "vi")),
      );
      onChange(category.id);
      setAdding(false);
      setName("");
      toasts.success(`Đã thêm chủ đề “${category.name}”.`);
    },
    onError: (error) => toasts.error(blogErrorMessage(error)),
  });

  return (
    <FormField
      label="Chủ đề"
      description={
        !loading && categories.length === 0
          ? canCreate
            ? "Chưa có chủ đề nào. Thêm chủ đề đầu tiên."
            : "Chưa có chủ đề nào. Nhờ quản trị viên tạo chủ đề trước khi gửi duyệt."
          : "Bắt buộc khi gửi duyệt."
      }
    >
      {(field) => (
        <div className="space-y-2">
          <Select {...field} value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">{loading ? "Đang tải…" : "— Chọn chủ đề —"}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          {canCreate &&
            (adding ? (
              <div className="flex gap-2">
                <Input
                  aria-label="Tên chủ đề mới"
                  autoFocus
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (name.trim()) create.mutate();
                    }
                  }}
                  placeholder="Ví dụ: Toán học"
                />
                <Button size="sm" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
                  Thêm
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                  Hủy
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="link" onClick={() => setAdding(true)}>
                + Thêm chủ đề mới
              </Button>
            ))}
        </div>
      )}
    </FormField>
  );
}

function CoverField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const toasts = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [broken, setBroken] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const image = await uploadImage(file);
      setBroken(false);
      onChange(image.url);
    } catch (error) {
      toasts.error(blogErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };
  return (
    <FormField
      label="Ảnh bìa (không bắt buộc)"
      description="Tải ảnh lên (JPEG, PNG, WebP, tối đa 5 MB) hoặc dán đường dẫn ảnh https://. Nên dùng ảnh ngang tỉ lệ 16:10."
    >
      {(field) => (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {value && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element -- author images from any host
            <img
              src={blogImageUrl(value)}
              alt="Ảnh bìa"
              onError={() => setBroken(true)}
              className="aspect-[16/10] w-full rounded-md border border-border object-cover sm:w-48"
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              {...field}
              // Not type="url": an uploaded cover is a path, /blog-images/<id>.
              type="text"
              inputMode="url"
              maxLength={2048}
              value={value}
              onChange={(event) => {
                setBroken(false);
                onChange(event.target.value);
              }}
              placeholder="https://…"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" loading={uploading} loadingLabel="Đang tải ảnh…" onClick={() => input.current?.click()}>
                Tải ảnh lên
              </Button>
              {value && (
                <Button size="sm" variant="ghost" onClick={() => onChange("")}>
                  Bỏ ảnh bìa
                </Button>
              )}
            </div>
            <input
              ref={input}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              hidden
              onChange={(event) => {
                void pick(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </FormField>
  );
}
