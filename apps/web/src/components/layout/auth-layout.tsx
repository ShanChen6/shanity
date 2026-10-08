import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "./page-container";
import { Icon } from "../ui/icon";
import { BrandLogo } from "../brand/brand-logo";

function LearningIllustration() {
  return (
    <div
      aria-hidden="true"
      className="learning-orbit relative mx-auto my-8 flex h-64 w-full max-w-sm items-center justify-center rounded-full xl:my-10"
    >
      <div className="absolute inset-7 rounded-full border border-border-strong" />
      <svg
        className="relative w-64 text-primary"
        viewBox="0 0 280 230"
        fill="none"
      >
        <path
          d="M33 75 133 91 248 64 238 171 134 206 38 178Z"
          fill="var(--primary)"
        />
        <path
          d="m39 66 95 17 104-27-7 103-97 33-91-28Z"
          fill="var(--surface)"
          stroke="var(--border-strong)"
          strokeWidth="2"
        />
        <path d="m134 83 104-27-7 103-97 33Z" fill="var(--accent)" />
        <path
          d="M134 83v109M58 87l57 11M58 101l57 11M58 115l34 7M154 106l58-17M154 119l58-17M154 132l35-10"
          stroke="var(--border-strong)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="m185 71 15-4v46l-8-4-7 9Z" fill="var(--primary)" />
        <path
          d="m83 32 6-14 6 14 14 6-14 6-6 14-6-14-14-6Z"
          fill="var(--primary)"
        />
        <circle
          cx="241"
          cy="28"
          r="7"
          fill="var(--accent)"
          stroke="var(--border-strong)"
        />
      </svg>
      <div className="absolute -left-1 top-9 rotate-[-8deg] rounded-2xl border border-border bg-surface px-4 py-2 text-xl font-semibold shadow-float">
        a² + b²
      </div>
      <div className="absolute -right-1 bottom-4 flex rotate-[5deg] items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-float">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-on-accent">
          <Icon name="check" />
        </span>
        <span className="text-xs font-semibold">Hiểu thêm một điều mới!</span>
      </div>
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-control bg-surface p-3 focus:not-sr-only"
      >
        Bỏ qua đến nội dung
      </a>
      <header className="py-5 sm:py-7">
        <PageContainer className="flex flex-wrap items-center justify-between gap-3">
          <BrandLogo width={132} highPriority />
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-primary"
          >
            Về trang chủ <Icon name="arrow" className="size-4" />
          </Link>
        </PageContainer>
      </header>
      <PageContainer className="flex flex-1 items-center pb-6 sm:pb-10">
        <main
          id="main-content"
          tabIndex={-1}
          className="auth-grid w-full overflow-hidden rounded-4xl border border-border bg-surface shadow-card"
        >
          <aside
            aria-label="Cùng học với Shanity"
            className="relative hidden flex-col justify-between bg-surface-secondary px-7 py-8 sm:px-10 lg:flex lg:p-12 xl:px-16"
          >
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.14em]">
                <span className="size-1.5 rounded-full bg-primary" /> MỖI NGÀY
                MỘT BƯỚC TIẾN
              </div>
              <h2 className="max-w-md text-display font-medium tracking-[-0.045em]">
                Nuôi dưỡng tò mò.
                <br />
                <span className="text-primary">Mở lối tương lai.</span>
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-muted">
                Từ một câu hỏi nhỏ đến những điều lớn lao. Shanity đồng hành
                cùng bạn trên từng bước học tập.
              </p>
            </div>
            <div className="hidden lg:block">
              <LearningIllustration />
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-strong pt-5 text-caption text-muted">
              <span className="inline-flex items-center gap-2">
                <Icon name="book" className="size-4" /> Học theo cách của bạn
              </span>
              <span className="inline-flex items-center gap-2">
                <Icon name="check" className="size-4" /> Tiến bộ từng ngày
              </span>
            </div>
          </aside>
          <section className="flex min-w-0 items-center justify-center px-6 py-9 sm:px-12 lg:px-10 xl:p-14">
            {children}
          </section>
        </main>
      </PageContainer>
      <footer className="pb-6">
        <PageContainer className="flex flex-wrap justify-between gap-2 text-xs text-muted">
          <p>Shanity · Không gian cho những điều bạn muốn học.</p>
          <p>Học một chút. Lớn lên mỗi ngày.</p>
        </PageContainer>
      </footer>
    </div>
  );
}
