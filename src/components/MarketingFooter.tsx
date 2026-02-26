import Link from "next/link";
import { dictionaries, type Locale } from "@/i18n/messages";

export default function MarketingFooter({ locale }: { locale: Locale }) {
  const dict = dictionaries[locale];
  const footerLinks = [
    { href: "/about", label: dict.common.about },
    { href: "/pricing", label: dict.common.pricing },
    { href: "/terms", label: dict.common.terms },
    { href: "/privacy", label: dict.common.privacy },
    { href: "/refund-policy", label: dict.common.refundPolicy },
  ];
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs font-semibold text-[var(--color-text-tertiary)] sm:px-6">
        <span className="gradient-text">{dict.common.appName}</span>
        <div className="flex flex-wrap gap-5">
          {footerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition hover:text-[var(--color-text-secondary)]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
