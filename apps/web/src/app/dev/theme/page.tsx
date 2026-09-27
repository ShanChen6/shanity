import { notFound } from "next/navigation";
import { ThemeShowcase } from "@/features/theme/theme-showcase";

export default function ThemePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ThemeShowcase />;
}
