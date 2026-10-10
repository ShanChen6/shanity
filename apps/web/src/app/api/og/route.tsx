import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand.config";
import { OG_SIZE, titleSize } from "@/features/blog/og";
import { fetchBlogPost } from "@/features/blog/server";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Card = {
  title: string;
  kicker: string;
  footer: string;
};

/**
 * Open Graph image (1200x630). `?slug=` draws the published post with that
 * slug; anything else (no slug, unknown or unpublished post) draws the
 * blog's own card. Text comes only from the stored post, never from the URL.
 * The bundled Geist font covers Vietnamese.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  let card: Card = {
    title: "Blog công nghệ",
    kicker: BRAND.name,
    footer: BRAND.tagline,
  };
  if (SLUG.test(slug)) {
    const page = await fetchBlogPost(slug).catch(() => null);
    if (page)
      card = {
        title: page.post.title,
        kicker: page.post.category?.name ?? "Blog",
        footer: `${page.post.author.name} · ${page.post.readingMinutes} phút đọc`,
      };
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0c403d 0%, #028983 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              padding: "8px 20px",
              borderRadius: 999,
              background: "#64ebd5",
              color: "#0c403d",
              fontSize: 28,
            }}
          >
            {card.kicker}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: titleSize(card.title),
            lineHeight: 1.15,
            letterSpacing: -1,
            maxWidth: 1050,
          }}
        >
          {card.title}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
            color: "#d9fbf5",
          }}
        >
          <span>{card.footer}</span>
          <span style={{ fontSize: 36, color: "#ffffff" }}>{BRAND.name}</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      headers: {
        // Titles rarely change; shared caches keep crawlers off the renderer.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    },
  );
}
