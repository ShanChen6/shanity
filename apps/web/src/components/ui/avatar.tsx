"use client";

import Image from "next/image";
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type AvatarContextValue = {
  name: string;
  imageLoaded: boolean;
  setImageLoaded: (loaded: boolean) => void;
};
const AvatarContext = createContext<AvatarContextValue | null>(null);

function useAvatar() {
  const value = useContext(AvatarContext);
  if (!value) throw new Error("Avatar parts must be used inside Avatar");
  return value;
}

export function Avatar({
  name,
  src,
  children,
  className = "",
}: {
  name: string;
  src?: string;
  children?: ReactNode;
  className?: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  const content = children ?? (
    <>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </>
  );

  return (
    <AvatarContext.Provider value={{ name, imageLoaded, setImageLoaded }}>
      <span
        role="img"
        aria-label={name}
        className={`relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-accent-foreground ${className}`}
      >
        {content}
      </span>
    </AvatarContext.Provider>
  );
}

export function AvatarImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const { name, setImageLoaded } = useAvatar();
  return (
    <Image
      src={src}
      alt={alt ?? name}
      fill
      sizes="48px"
      className={`object-cover ${className}`}
      onLoad={() => setImageLoaded(true)}
      onError={() => setImageLoaded(false)}
    />
  );
}

export function AvatarFallback({ children }: { children?: ReactNode }) {
  const { name, imageLoaded } = useAvatar();
  if (imageLoaded) return null;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return <span aria-hidden="true">{children ?? initials}</span>;
}
