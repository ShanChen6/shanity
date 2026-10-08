import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
// Only the public API origin is exposed; never copy backend secrets into next.env.
let publicApi = process.env.NEXT_PUBLIC_API_URL;
if (!publicApi) {
  try {
    publicApi = parseEnv(
      readFileSync(resolve(process.cwd(), "../../.env"), "utf8"),
    ).NEXT_PUBLIC_API_URL;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
const apiUrl = new URL(publicApi || "http://localhost:4000");
if (
  !["http:", "https:"].includes(apiUrl.protocol) ||
  apiUrl.username ||
  apiUrl.password ||
  apiUrl.search ||
  apiUrl.hash ||
  apiUrl.pathname !== "/"
)
  throw new Error("NEXT_PUBLIC_API_URL must be an HTTP(S) origin");
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_API_URL: apiUrl.origin },
  // Renamed pages keep working for bookmarks and old links (query is kept).
  async redirects() {
    return [
      {
        source: "/my-quiz-attempts",
        destination: "/quiz-attempts",
        permanent: true,
      },
    ];
  },
  images: {
    // AVIF first (smallest), WebP as fallback; the source PNG only as a last resort.
    formats: ["image/avif", "image/webp"],
  },
};
export default nextConfig;
