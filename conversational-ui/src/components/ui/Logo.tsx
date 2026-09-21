import Image from "next/image";

import logo from "../../../assets/logo.png";
import { cn } from "@/lib/utils";

/**
 * Under Armour logo image. The artwork is black on a transparent background, so
 * pass `invert` (or `dark:invert`) when placing it on a dark/brand surface.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src={logo}
      alt="Under Armour"
      priority
      sizes="40px"
      className={cn("h-9 w-auto object-contain", className)}
    />
  );
}
