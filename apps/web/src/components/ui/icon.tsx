import type { SVGProps } from "react";

const paths = {
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M6 18 18 6",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",

  arrow: "M5 12h14m-6-6 6 6-6 6",
  mail: "M4 5h16v14H4z M4 6l8 6 8-6",
  lock: "M6 10h12v10H6z M8 10V7a4 4 0 0 1 8 0v3",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  eyeOff:
    "m3 3 18 18 M10 5a12 12 0 0 1 12 7 15 15 0 0 1-4 5 M6 6a17 17 0 0 0-4 6s3 7 10 7a13 13 0 0 0 4-1 M10 10a3 3 0 0 0 4 4",
  check: "m5 12 4 4L19 6",
  book: "M12 6C8 3 4 4 3 5v14c3-2 6-1 9 1 3-2 6-3 9-1V5c-3-2-6-1-9 1v14",
  info: "M12 10v7 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  search: "m20 20-4.5-4.5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5.6 9A7 7 0 0 1 18 6l2 2 M4 16l2 2a7 7 0 0 0 12.4-3",
  arrowLeft: "M19 12H5m6 6-6-6 6-6",
} as const;

export function Icon({
  name,
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 shrink-0 ${className}`}
    >
      <path d={paths[name]} />
    </svg>
  );
}
