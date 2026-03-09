import Link from "next/link";

type MarketingAuthActionsProps = {
  signInLabel: string;
  signUpLabel: string;
};

export default function MarketingAuthActions({
  signInLabel,
  signUpLabel,
}: MarketingAuthActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/sign-in"
        className="text-sm font-semibold text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)]"
      >
        {signInLabel}
      </Link>
      <Link href="/sign-up" className="btn-primary">
        {signUpLabel}
      </Link>
    </div>
  );
}
