import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const E2E_SECRET = "playwright-local-secret";
async function createMagicLink(
  baseRequest: APIRequestContext,
  email: string,
  callbackUrl: string,
) {
  const response = await baseRequest.post("/api/auth/magic-link/request", {
    headers: {
      "x-e2e-secret": E2E_SECRET,
    },
    data: { email, callbackUrl },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { ok?: boolean; magicLink?: string };
  expect(payload.ok).toBe(true);
  expect(typeof payload.magicLink).toBe("string");
  return payload.magicLink as string;
}

async function signInWithMagicLink(
  page: Page,
  request: APIRequestContext,
  callbackUrl = "/cards",
) {
  const email = `playwright-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const magicLink = await createMagicLink(request, email, callbackUrl);
  await page.goto(magicLink);
  return email;
}

async function billingAction(
  request: APIRequestContext,
  data: Record<string, unknown>,
) {
  const response = await request.post("/api/test/billing", {
    headers: { "x-e2e-secret": E2E_SECRET },
    data,
  });
  if (response.status() !== 200) {
    const text = await response.text();
    throw new Error(`billingAction failed (${response.status()}): ${text}`);
  }
  return (await response.json()) as {
    billing?: {
      isActive?: boolean;
      trialActive?: boolean;
      plan?: string;
      accessSource?: string | null;
      subscriptionStatus?: string | null;
      paddleSubscriptionId?: string | null;
    };
    snapshot?: {
      manualAccessTier?: string | null;
      manualAccessEndsAt?: number | null;
      subscriptionStatus?: string | null;
      currentPeriodEndsAt?: number | null;
      nextBilledAt?: number | null;
    };
  };
}

test("protected app route redirects unauthenticated users to sign-in", async ({ request }) => {
  const response = await request.get("/cards", {
    maxRedirects: 0,
  });
  expect([302, 307, 308]).toContain(response.status());
  const location = response.headers()["location"] ?? "";
  expect(location).toContain("/sign-in");
  expect(location).toContain("callbackUrl=%2Fcards");
});

test("magic-link full sign-in flow shows upgrade controls before checkout", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/cards");

  await page.waitForURL(/\/cards/);
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto("/start-trial");
  await page.waitForURL(/\/start-trial/);
  await expect(page.getByRole("heading", { name: /Start your Pro trial|开始你的 Pro 试用/ })).toBeVisible();
  await expect(page.getByText(/Signed in as|当前登录账号/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Start Pro trial|开始 Pro 试用/ })).toBeVisible();
  await expect(page.getByText(/Pro\+ trial is active|Pro\+ 试用进行中/)).toHaveCount(0);

  await expect(page.getByText(/Add your payment details now|现在添加付款方式即可开始/)).toBeVisible();

  await page.goto("/cards");
  await page.waitForURL(/\/cards/);
});

test("authenticated checkout validates plan input", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  const response = await page.request.post("/api/paddle/checkout", {
    data: { plan: "invalid_plan" },
  });
  expect(response.status()).toBe(400);
  const payload = (await response.json()) as { error?: string };
  expect(payload.error ?? "").toContain("Invalid plan");
});

test("magic-link token cannot be reused", async ({ browser, request }) => {
  const email = `playwright-onetime-${Date.now()}@example.com`;
  const magicLink = await createMagicLink(request, email, "/cards");

  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  await firstPage.goto(magicLink);
  await firstPage.waitForURL(/\/cards/);
  await firstContext.close();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto(magicLink);
  await secondPage.waitForURL(/\/sign-in/);
  await expect(
    secondPage.getByText(/Magic link is invalid or expired|邮箱登录链接无效或已过期/),
  ).toBeVisible();
  await secondContext.close();
});

test("trial expiration behavior blocks paid routes and pro APIs", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  await billingAction(page.request, { action: "reset" });
  const backdated = await billingAction(page.request, { action: "state" });
  expect(backdated.billing?.trialActive).toBe(false);
  expect(backdated.billing?.isActive).toBe(false);

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(402);

  await page.goto("/cards");
  await page.waitForURL(/\/start-trial\?/);
  await expect(page).toHaveURL(/from=%2Fcards/);
});

test("active paid subscription unlocks paid routes and pro API gate", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  await billingAction(page.request, { action: "reset" });
  const activated = await billingAction(page.request, {
    action: "simulateWebhook",
    status: "active",
    plan: "pro_monthly",
  });
  expect(activated.billing?.isActive).toBe(true);
  expect(activated.billing?.plan).toBe("pro");
  expect(activated.billing?.subscriptionStatus).toBe("active");

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(400);

  await page.goto("/cards");
  await page.waitForURL(/\/cards/);
});

test("manual pro plus access unlocks paid routes and still blocks checkout", async ({
  page,
  request,
}) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  await billingAction(page.request, { action: "reset" });
  const manual = await billingAction(page.request, {
    action: "setManualAccess",
    tier: "pro_plus",
    endsInDays: 30,
  });
  expect(manual.billing?.isActive).toBe(true);
  expect(manual.billing?.plan).toBe("pro_plus");
  expect(manual.billing?.accessSource).toBe("manual");
  expect(manual.snapshot?.manualAccessTier).toBe("pro_plus");

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(400);

  const checkout = await page.request.post("/api/paddle/checkout", {
    data: { plan: "pro_monthly" },
  });
  expect(checkout.status()).toBe(409);

  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: /Contact support|联系支持/ }),
  ).toBeVisible();
});

test("checkout blocks creating a second subscription when one is already active", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  await billingAction(page.request, { action: "reset" });
  await billingAction(page.request, {
    action: "simulateWebhook",
    status: "active",
    plan: "pro_monthly",
  });

  const checkout = await page.request.post("/api/paddle/checkout", {
    data: { plan: "pro_monthly" },
  });
  expect(checkout.status()).toBe(409);
  const payload = (await checkout.json()) as { error?: string; code?: string };
  expect(payload.code).toBe("active_subscription_exists");
  expect(payload.error ?? "").toContain("Active access already exists");
});

test("billing remains active when a newer inactive row exists for a different subscription", async ({
  page,
  request,
}) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  await billingAction(page.request, { action: "reset" });
  const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const activeSubscriptionId = `sub_test_active_main_${idSuffix}`;
  const canceledSubscriptionId = `sub_test_canceled_old_${idSuffix}`;

  const active = await billingAction(page.request, {
    action: "simulateWebhook",
    subscriptionId: activeSubscriptionId,
    status: "active",
    plan: "pro_monthly",
  });
  expect(active.billing?.isActive).toBe(true);
  expect(active.billing?.subscriptionStatus).toBe("active");
  expect(active.billing?.paddleSubscriptionId).toBe(activeSubscriptionId);

  const mixed = await billingAction(page.request, {
    action: "simulateWebhook",
    subscriptionId: canceledSubscriptionId,
    status: "canceled",
    plan: "pro_monthly",
  });
  expect(mixed.billing?.isActive).toBe(true);
  expect(mixed.billing?.subscriptionStatus).toBe("active");
  expect(mixed.billing?.paddleSubscriptionId).toBe(activeSubscriptionId);

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(400);
});

test("older webhook for the same subscription is ignored to prevent stale overwrite", async ({
  page,
  request,
}) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  await billingAction(page.request, { action: "reset" });
  const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const subscriptionId = `sub_test_stale_guard_${idSuffix}`;

  const fresh = await billingAction(page.request, {
    action: "simulateWebhook",
    subscriptionId,
    status: "active",
    plan: "pro_monthly",
    occurredAtOffsetDays: 0,
  });
  expect(fresh.billing?.isActive).toBe(true);
  expect(fresh.billing?.subscriptionStatus).toBe("active");

  const stale = await billingAction(page.request, {
    action: "simulateWebhook",
    subscriptionId,
    status: "canceled",
    plan: "pro_monthly",
    occurredAtOffsetDays: -2,
    subscriptionUpdatedAtOffsetDays: -2,
  });
  expect(stale.billing?.isActive).toBe(true);
  expect(stale.billing?.subscriptionStatus).toBe("active");

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(400);
});

test("subscription status transitions enforce access correctly", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);
  await billingAction(page.request, { action: "reset" });

  const cases: Array<{
    status: "trialing" | "active" | "past_due" | "canceled" | "expired";
    expectedActive: boolean;
    expectedProApiStatus: number;
    currentPeriodEndsInDays?: number;
    nextBilledInDays?: number;
  }> = [
    { status: "trialing", expectedActive: true, expectedProApiStatus: 400 },
    { status: "active", expectedActive: true, expectedProApiStatus: 400 },
    {
      status: "trialing",
      expectedActive: false,
      expectedProApiStatus: 402,
      currentPeriodEndsInDays: -1,
      nextBilledInDays: -1,
    },
    {
      status: "active",
      expectedActive: false,
      expectedProApiStatus: 402,
      currentPeriodEndsInDays: -1,
      nextBilledInDays: -1,
    },
    { status: "past_due", expectedActive: false, expectedProApiStatus: 402 },
    { status: "canceled", expectedActive: true, expectedProApiStatus: 400, currentPeriodEndsInDays: 29 },
    { status: "expired", expectedActive: false, expectedProApiStatus: 402, currentPeriodEndsInDays: -1 },
  ];

  for (const row of cases) {
    const result = await billingAction(page.request, {
      action: "simulateWebhook",
      status: row.status,
      plan: "pro_monthly",
      ...(row.currentPeriodEndsInDays !== undefined
        ? { currentPeriodEndsInDays: row.currentPeriodEndsInDays }
        : {}),
      ...(row.nextBilledInDays !== undefined
        ? { nextBilledInDays: row.nextBilledInDays }
        : {}),
    });
    expect(result.billing?.subscriptionStatus).toBe(row.status);
    expect(Boolean(result.billing?.isActive)).toBe(row.expectedActive);

    const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
    expect(proApi.status()).toBe(row.expectedProApiStatus);
  }
});

test("checkout stays blocked after cancellation until the paid period ends", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);
  await billingAction(page.request, { action: "reset" });

  const canceled = await billingAction(page.request, {
    action: "simulateWebhook",
    status: "canceled",
    plan: "pro_monthly",
    currentPeriodEndsInDays: 14,
    nextBilledInDays: 14,
  });
  expect(canceled.billing?.isActive).toBe(true);
  expect(canceled.billing?.subscriptionStatus).toBe("canceled");

  const checkout = await page.request.post("/api/paddle/checkout", {
    data: { plan: "pro_monthly" },
  });
  expect(checkout.status()).toBe(409);
});

test("renewal and expiration updates are reflected after webhook sequence", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);
  await billingAction(page.request, { action: "reset" });

  const first = await billingAction(page.request, {
    action: "simulateWebhook",
    status: "active",
    plan: "pro_monthly",
    currentPeriodEndsInDays: 30,
    nextBilledInDays: 30,
  });

  const second = await billingAction(page.request, {
    action: "simulateWebhook",
    status: "active",
    plan: "pro_monthly",
    currentPeriodEndsInDays: 60,
    nextBilledInDays: 60,
  });

  expect(second.billing?.isActive).toBe(true);
  expect(
    (second.snapshot?.currentPeriodEndsAt ?? 0) >
      (first.snapshot?.currentPeriodEndsAt ?? 0),
  ).toBe(true);
  expect(
    (second.snapshot?.nextBilledAt ?? 0) >
      (first.snapshot?.nextBilledAt ?? 0),
  ).toBe(true);

  const expired = await billingAction(page.request, {
    action: "simulateWebhook",
    status: "expired",
    plan: "pro_monthly",
    currentPeriodEndsInDays: -1,
    nextBilledInDays: -1,
  });
  expect(expired.billing?.isActive).toBe(false);
  expect(expired.billing?.subscriptionStatus).toBe("expired");

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(402);
});

test("optional real Paddle checkout contract in CI", async ({ page, request }) => {
  test.skip(
    process.env.PADDLE_REAL_CI !== "1" ||
      !process.env.PADDLE_API_KEY ||
      !process.env.PADDLE_PRICE_ID_PRO_MONTHLY,
    "Set PADDLE_REAL_CI=1, PADDLE_API_KEY, and PADDLE_PRICE_ID_PRO_MONTHLY to run this contract test.",
  );
  await signInWithMagicLink(page, request, "/start-trial");
  await page.waitForURL(/\/start-trial/);

  const response = await page.request.post("/api/paddle/checkout", {
    data: { plan: "pro_monthly" },
  });
  if (response.status() !== 200) {
    const detail = await response.text();
    throw new Error(`Real Paddle checkout contract failed (${response.status()}): ${detail}`);
  }
  const payload = (await response.json()) as {
    priceId?: string;
    customerEmail?: string;
    checkoutSessionId?: string;
    checkoutToken?: string;
  };
  expect(typeof payload.priceId).toBe("string");
  expect(payload.priceId ?? "").not.toHaveLength(0);
  expect(typeof payload.customerEmail).toBe("string");
  expect(payload.customerEmail ?? "").toContain("@");
  expect(typeof payload.checkoutSessionId).toBe("string");
  expect(payload.checkoutSessionId ?? "").not.toHaveLength(0);
  expect(typeof payload.checkoutToken).toBe("string");
  expect(payload.checkoutToken ?? "").not.toHaveLength(0);
});

test("billing APIs reject unauthenticated requests", async ({ request }) => {
  const checkoutResponse = await request.post("/api/paddle/checkout", {
    data: { plan: "pro_monthly" },
  });
  expect(checkoutResponse.status()).toBe(401);

  const portalResponse = await request.post("/api/paddle/portal");
  expect(portalResponse.status()).toBe(401);
});

test("pricing page mentions monthly pricing and the 3-day trial", async ({ request }) => {
  const response = await request.get("/pricing");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/monthly/i);
  const configuredTrialDays = Number(process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3");
  if (Number.isFinite(configuredTrialDays) && configuredTrialDays > 0) {
    expect(html).toMatch(new RegExp(`${Math.floor(configuredTrialDays)}-day`, "i"));
  } else {
    expect(html).not.toMatch(/trial/i);
  }
});
