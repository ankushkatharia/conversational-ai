"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "../../lib/utils";

/**
 * Product image with a graceful fallback. Uses a native lazy <img> and degrades
 * to a branded placeholder when the URL is missing or fails to load.
 */
export function ProductImage({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-surface-muted",
          className,
        )}
        role="img"
        aria-label={`${alt} (image unavailable)`}
      >
        <ImageOff className="h-8 w-8 text-muted" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
    />
  );
}
