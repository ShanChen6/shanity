import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/features/auth/session-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { QueryProvider } from "@/providers/query-provider";
import { CommandMenuProvider } from "@/features/command-menu/command-menu";
import { BRAND } from "@/config/brand.config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: BRAND.description,
  // favicon.ico is picked up from app/; the manifest from app/manifest.ts.
  icons: {
    icon: [
      { url: BRAND.assets.favicon16, sizes: "16x16", type: "image/png" },
      { url: BRAND.assets.favicon32, sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: BRAND.assets.appleTouchIcon, sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: BRAND.themeColor.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning={true}
    >
      <body className="min-h-full flex flex-col">
        <Script id="shanity-theme-init" strategy="beforeInteractive">
          {`var t=null;try{t=localStorage.getItem("shanity-theme")}catch(e){}var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=t||"system"`}
        </Script>
        <ThemeProvider>
          <QueryProvider>
            <SessionProvider>
              <CommandMenuProvider>{children}</CommandMenuProvider>
            </SessionProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
