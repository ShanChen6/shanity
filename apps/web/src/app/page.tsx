import Link from "next/link";

export default function Home() {
  return (
    <div className="page flex flex-1 flex-col">
      <main className="container flex flex-1 flex-col items-center justify-center py-16 text-center">
        <p className="text-caption font-semibold uppercase text-primary">
          Shanity · Học mỗi ngày
        </p>
        <h1 className="mt-4 max-w-3xl font-heading text-h1 font-semibold">
          Học theo nhịp của bạn.
        </h1>
        <p className="mt-4 max-w-2xl text-body-lg text-foreground-secondary">
          Một không gian rõ ràng để khám phá kiến thức, theo dõi tiến độ và đi
          thêm một bước mỗi ngày.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Đăng nhập
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Tạo tài khoản
          </Link>
        </div>
        {process.env.NODE_ENV === "development" && (
          <Link href="/dev/theme" className="text-link mt-8 text-sm">
            Mở theme showcase
          </Link>
        )}
      </main>
    </div>
  );
}
