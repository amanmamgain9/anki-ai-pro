type PortalPayload = {
  url?: string;
  error?: string;
};

export async function openBillingPortal() {
  const response = await fetch("/api/paddle/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const payload = (await response.json()) as PortalPayload;
  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? "Failed to open billing portal");
  }
  window.location.assign(payload.url);
}
