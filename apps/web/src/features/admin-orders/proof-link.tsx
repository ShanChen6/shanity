import { proofHref } from "./api";

/** Proof of transfer, opened on demand: each open is recorded by the API. */
export function ProofLink({ url }: { url: unknown }) {
  const href = typeof url === "string" ? proofHref(url) : null;
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
    >
      Xem chứng từ (mở tab mới)
    </a>
  );
}
