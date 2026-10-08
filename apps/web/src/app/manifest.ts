import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand.config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.themeColor.light,
    theme_color: BRAND.themeColor.light,
    icons: [
      {
        src: BRAND.assets.androidChrome192,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: BRAND.assets.androidChrome512,
        sizes: "512x512",
        type: "image/png",
      },
      // The icons carry transparent margins, so they are safe as maskable art.
      {
        src: BRAND.assets.androidChrome512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
