import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { BRAND } from "@/config/brand.config";
import { footerNav } from "@/config/navigation.config";
import { SITE } from "@/config/site.config";
import { SystemStatusIndicator } from "@/features/system-status/system-status-indicator";

const linkClass =
  "inline-flex min-h-11 items-center text-body-sm text-muted hover:text-foreground hover:underline";

/** Sitemap, legal, contact and live system status; identical on every page. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="container grid gap-10 py-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="space-y-4">
          <BrandLogo width={140} />
          <p className="max-w-xs text-body-sm text-muted">
            {BRAND.description}
          </p>
          {SITE.socialLinks.length > 0 && (
            <ul aria-label="Mạng xã hội" className="flex flex-wrap gap-x-4">
              {SITE.socialLinks.map((social) => (
                <li key={social.id}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {social.label}
                    <span className="sr-only"> (mở trong tab mới)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {footerNav.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="mb-2 text-sm font-semibold">{group.title}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              {group.title === "Pháp lý" && SITE.supportEmail && (
                <li>
                  <a href={`mailto:${SITE.supportEmail}`} className={linkClass}>
                    Liên hệ hỗ trợ
                  </a>
                </li>
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container flex flex-col gap-2 py-4 text-body-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.legalEntity ?? BRAND.name}. Bảo
            lưu mọi quyền.
            {SITE.legalAddress ? ` ${SITE.legalAddress}` : ""}
          </p>
          <SystemStatusIndicator />
        </div>
      </div>
    </footer>
  );
}
