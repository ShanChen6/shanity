import type { ReactNode } from "react";
import { SITE } from "@/config/site.config";

const date = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export type LegalSection = { heading: string; body: ReactNode };

/** Shared layout of the legal pages: title, review date, numbered sections. */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}) {
  return (
    <main className="container max-w-3xl flex-1 py-10 sm:py-14">
      <h1 className="font-heading text-h1 font-semibold">{title}</h1>
      <p className="mt-2 text-body-sm text-muted">
        Cập nhật lần cuối:{" "}
        <time dateTime={SITE.legalUpdated}>
          {date.format(new Date(SITE.legalUpdated))}
        </time>
      </p>
      <p className="mt-6 text-body text-foreground-secondary">{intro}</p>
      <div className="mt-8 space-y-8">
        {sections.map((section, index) => (
          <section key={section.heading} aria-labelledby={`legal-${index}`}>
            <h2
              id={`legal-${index}`}
              className="font-heading text-h3 font-semibold"
            >
              {index + 1}. {section.heading}
            </h2>
            <div className="mt-3 space-y-3 text-body text-foreground-secondary">
              {section.body}
            </div>
          </section>
        ))}
      </div>
      {SITE.supportEmail && (
        <p className="mt-10 border-t border-border pt-6 text-body-sm text-muted">
          Câu hỏi về nội dung này? Liên hệ{" "}
          <a className="text-link" href={`mailto:${SITE.supportEmail}`}>
            {SITE.supportEmail}
          </a>
          .
        </p>
      )}
    </main>
  );
}
