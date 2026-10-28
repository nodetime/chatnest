import Image from "next/image";

/** The original Figma Radar mark; visible product names label its enclosing link. */
export function BrandMark({ size = 32 }: { size?: 24 | 28 | 32 }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="shrink-0 object-contain"
      height={size}
      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand/radar.svg`}
      unoptimized
      width={size}
    />
  );
}
