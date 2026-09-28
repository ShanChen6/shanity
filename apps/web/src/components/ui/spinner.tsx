export function Spinner({
  label = "Đang tải",
  decorative = false,
  className = "",
}: {
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <span
      role={decorative ? undefined : "status"}
      className={`inline-flex items-center ${className}`}
      aria-hidden={decorative || undefined}
    >
      <svg
        className="size-4 animate-spin motion-reduce:animate-none"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity=".25"
        />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}
