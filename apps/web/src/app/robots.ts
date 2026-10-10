import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/config/site.config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in areas: nothing for search engines there.
      disallow: [
        "/admin",
        "/instructor",
        "/learn",
        "/dashboard",
        "/my-learning",
        "/my-courses",
        "/checkout",
        "/account",
        "/orders",
        "/profile",
        "/quiz-attempts",
        "/student",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
