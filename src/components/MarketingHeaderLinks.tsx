import Link from "next/link";

type MarketingHeaderLinksProps = {
  aboutLabel: string;
  pricingLabel: string;
  contactLabel: string;
  className?: string;
};

export default function MarketingHeaderLinks({
  aboutLabel,
  pricingLabel,
  contactLabel,
  className,
}: MarketingHeaderLinksProps) {
  return (
    <nav
      aria-label="Marketing navigation"
      className={className ?? "hidden items-center gap-5 md:flex"}
    >
      <Link
        href="/pricing"
        className="text-sm font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)]"
      >
        {pricingLabel}
      </Link>
      <Link
        href="/about"
        className="text-sm font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)]"
      >
        {aboutLabel}
      </Link>
      <Link
        href="/contact"
        className="text-sm font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)]"
      >
        {contactLabel}
      </Link>
    </nav>
  );
}
