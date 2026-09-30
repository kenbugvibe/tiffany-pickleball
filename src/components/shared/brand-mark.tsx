import Image from "next/image";

import logo from "@/assets/logo.png";

export function BrandMark({ className = "size-12" }: { className?: string }) {
  return (
    <Image
      src={logo}
      alt=""
      aria-hidden="true"
      sizes="96px"
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
