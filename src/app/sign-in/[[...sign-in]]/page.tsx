import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <Link href="/" className="gradient-text mb-8 text-lg font-bold tracking-tight">
        ANKI CARDS
      </Link>
      <SignIn />
    </div>
  );
}
