"use client";

import { UserProfile } from "@clerk/nextjs";

export default function SettingsView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight"><span className="gradient-text">Settings</span></h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Manage your account and preferences.</p>
      </div>
      <>
        <UserProfile routing="hash" appearance={{ elements: { rootBox: "w-full", card: "shadow-none border-0 bg-transparent", navbar: "hidden", pageScrollBox: "p-5" } }} />
      </>
    </div>
  );
}
