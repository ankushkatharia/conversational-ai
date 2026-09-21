"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Product image with a graceful fallback. Uses next/image (lazy by default) and
 * degrades to a branded placeholder when the URL is missing or fails to load.
 */
export function ProductImage({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src?: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
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
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? "(max-width: 640px) 100vw, 320px"}
      priority={priority}
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}
