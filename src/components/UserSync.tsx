"use client";

import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

const api = anyApi;

export default function UserSync() {
  const { data: session, status } = useSession();
  const syncCurrentUser = useMutation(api.billing.syncCurrentUser);
  const lastSyncedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    const syncKey = session?.user?.email ?? session?.user?.name ?? "authenticated";
    if (lastSyncedKeyRef.current === syncKey) return;
    lastSyncedKeyRef.current = syncKey;
    syncCurrentUser({}).catch(() => {
      lastSyncedKeyRef.current = null;
    });
  }, [session?.user?.email, session?.user?.name, status, syncCurrentUser]);

  return null;
}
