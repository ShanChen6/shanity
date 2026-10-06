"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { API_URL } from "@/lib/api";

const covers = [
  "from-emerald-700 via-teal-700 to-slate-900",
  "from-amber-500 via-orange-600 to-rose-800",
  "from-cyan-600 via-sky-700 to-indigo-900",
  "from-lime-600 via-green-700 to-teal-950",
];

function resolveImageSource(source: string) {
  if (source.startsWith("/")) return `${API_URL}${source}`;
  if (/^https?:\/\//i.test(source)) return source;
  return `${API_URL}/${source.replace(/^\/+/, "")}`;
}

export function CatalogThumbnail({
  source,
  title,
  badge = "Đã xuất bản",
}: {
  source: string | null;
  title: string;
  badge?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const cover = covers[title.length % covers.length]!;

  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-surface-secondary">
      {source && !failed ? (
        <Image
          src={resolveImageSource(source)}
          alt={`Ảnh khóa học ${title}`}
          fill
          unoptimized
          sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 25vw"
          className="object-cover transition-transform duration-slow group-hover:scale-[1.035]"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={`relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br ${cover} text-white`}
          role="img"
          aria-label={`Ảnh minh họa khóa học ${title}`}
        >
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0 18px, rgba(255,255,255,.28) 18px 19px, transparent 19px 38px)",
            }}
          />
          <span className="relative flex size-16 items-center justify-center rounded-xl border border-white/30 bg-black/10 backdrop-blur-sm">
            <Icon name="book" className="size-9" />
          </span>
        </div>
      )}
      {badge && (
        <span className="absolute left-3 top-3 rounded-sm bg-black/60 px-2.5 py-1 text-caption font-semibold text-white backdrop-blur-sm">
          {badge}
        </span>
      )}
    </div>
  );
}
