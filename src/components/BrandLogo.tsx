import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  className?: string;
  textClassName?: string;
  iconSize?: number;
  showName?: boolean;
  priority?: boolean;
};

export default function BrandLogo({
  href = "/",
  className = "",
  textClassName = "gradient-text text-lg font-bold tracking-tight",
  iconSize = 28,
  showName = true,
  priority = false,
}: BrandLogoProps) {
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/brand/logo-mark-512.png"
        alt="aiankipro logo"
        width={iconSize}
        height={iconSize}
        className="h-auto w-auto rounded-[20%]"
        priority={priority}
      />
      {showName && <span className={textClassName}>aiankipro</span>}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="aiankipro home">
      {content}
    </Link>
  );
}
