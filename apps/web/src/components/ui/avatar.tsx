import Image from "next/image";

export function Avatar({
  name,
  src,
  className = "",
}: {
  name: string;
  src?: string;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <span
      className={`relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-accent-foreground ${className}`}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes="40px"
          className="object-cover"
        />
      ) : (
        <span role="img" aria-label={name}>
          {initials}
        </span>
      )}
    </span>
  );
}
