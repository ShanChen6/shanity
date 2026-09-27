import Link from "next/link";

export function Logo({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "mark";
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Shanity — trang chủ"
      className={`inline-flex min-h-11 items-center font-heading text-2xl font-bold ${className}`}
    >
      {variant === "full" ? (
        <>
          shanity<span className="text-primary">.</span>
        </>
      ) : (
        <>
          s<span className="text-primary">.</span>
        </>
      )}
    </Link>
  );
}
