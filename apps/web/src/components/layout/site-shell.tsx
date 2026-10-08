import type { ReactNode } from "react";
import { BreadcrumbProvider, Breadcrumbs } from "./breadcrumbs";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * Frame for every public and learner page: skip link, header, breadcrumbs,
 * footer. Pages render their own <main>; the wrapper below is only the skip
 * link's focus target.
 */
export function SiteShell({
  children,
  breadcrumbs = true,
}: {
  children: ReactNode;
  breadcrumbs?: boolean;
}) {
  return (
    <BreadcrumbProvider>
      <div className="page flex flex-1 flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3 focus:shadow-md"
        >
          Bỏ qua đến nội dung chính
        </a>
        <SiteHeader />
        {breadcrumbs && (
          <Breadcrumbs
            root={{ label: "Trang chủ", href: "/" }}
            className="container pb-1 pt-4"
          />
        )}
        <div
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none"
        >
          {children}
        </div>
        <SiteFooter />
      </div>
    </BreadcrumbProvider>
  );
}
