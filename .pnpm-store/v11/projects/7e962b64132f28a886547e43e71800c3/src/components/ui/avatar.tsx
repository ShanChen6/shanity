"use client";

import Image from "next/image";
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type AvatarContextValue = {
  name: string;
  unoptimized?: boolean;
  imageLoaded: boolean;
  setImageLoaded: (loaded: boolean) => void;
};
const AvatarContext = createContext<AvatarContextValue | null>(null);

function useAvatar() {
  const value = useContext(AvatarContext);
  if (!value) throw new Error("Avatar parts must be used inside Avatar");
  return value;
}

type AvatarProps = {
  name: string;
  src?: string;
  children?: ReactNode;
  className?: string;
  unoptimized?: boolean;
};

export function Avatar(props: AvatarProps) {
  return <AvatarContent key={props.src ?? "fallback"} {...props} />;
}

function AvatarContent({
  name,
  src,
  children,
  className = "",
  unoptimized,
}: AvatarProps) {
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
    <AvatarContext.Provider
      value={{ name, unoptimized, imageLoaded, setImageLoaded }}
    >
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
  const { name, unoptimized, setImageLoaded } = useAvatar();
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      src={src}
      unoptimized={unoptimized}
      alt={alt ?? name}
      fill
      sizes="48px"
      className={`object-cover ${className}`}
      onLoad={() => setImageLoaded(true)}
      onError={() => {
        setImageLoaded(false);
        setFailed(true);
      }}
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
