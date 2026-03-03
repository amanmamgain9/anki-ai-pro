import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const E2E_SECRET = "playwright-local-secret";
const expectedPlans = [
  "pro_monthly",
  "pro_yearly",
  "pro_plus_monthly",
  "pro_plus_yearly",
];

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
      subscriptionStatus?: string | null;
      paddleSubscriptionId?: string | null;
    };
    snapshot?: {
      subscriptionStatus?: string | null;
      currentPeriodEndsAt?: number | null;
      nextBilledAt?: number | null;
    };
  };
}

test("billing plans endpoint exposes monthly/yearly and trial conditions", async ({ request }) => {
  const response = await request.get("/api/paddle/plans");
  expect(response.status()).toBe(200);

  const payload = (await response.json()) as {
    trialDays?: number;
    plans?: Array<{
      plan?: string;
      tier?: string;
      interval?: string;
      trialEligible?: boolean;
      checkoutEnabled?: boolean;
    }>;
  };

  expect(typeof payload.trialDays).toBe("number");
  expect(Array.isArray(payload.plans)).toBe(true);

  const plans = payload.plans ?? [];
  const planNames = plans.map((p) => p.plan);
  expect(planNames).toEqual(expectedPlans);

  const proMonthly = plans.find((p) => p.plan === "pro_monthly");
  const proYearly = plans.find((p) => p.plan === "pro_yearly");
  const proPlusMonthly = plans.find((p) => p.plan === "pro_plus_monthly");
  const proPlusYearly = plans.find((p) => p.plan === "pro_plus_yearly");

  expect(proMonthly?.interval).toBe("monthly");
  expect(proYearly?.interval).toBe("yearly");
  expect(proPlusMonthly?.tier).toBe("pro_plus");
  expect(proPlusYearly?.tier).toBe("pro_plus");

  if ((payload.trialDays ?? 0) > 0) {
    expect(proMonthly?.trialEligible).toBe(false);
    expect(proYearly?.trialEligible).toBe(false);
    expect(proPlusMonthly?.trialEligible).toBe(true);
    expect(proPlusYearly?.trialEligible).toBe(true);
  } else {
    for (const row of plans) {
      expect(row.trialEligible).toBe(false);
    }
  }

  for (const row of plans) {
    expect(typeof row.checkoutEnabled).toBe("boolean");
  }
});

test("protected app route redirects unauthenticated users to sign-in", async ({ request }) => {
  const response = await request.get("/cards", {
    maxRedirects: 0,
  });
  expect([302, 307, 308]).toContain(response.status());
  const location = response.headers()["location"] ?? "";
  expect(location).toContain("/sign-in");
  expect(location).toContain("callbackUrl=%2Fcards");
});

test("magic-link full sign-in flow grants trial access and shows upgrade controls", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/cards");

  await page.waitForURL(/\/cards/);
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto("/settings");
  await page.waitForURL(/\/settings/);
  await expect(page.getByRole("heading", { name: /Settings|设置/ })).toBeVisible();
  await expect(page.getByText(/Plan:|套餐：/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Upgrade|升级|Change plan|更改套餐/ })).toBeVisible();
  await expect(page.getByText(/Free Pro\+ trial is active|免费 Pro\+ 试用进行中/)).toBeVisible();

  await page.getByRole("button", { name: /Upgrade|升级|Change plan|更改套餐/ }).click();
  await expect(page.getByRole("button", { name: /Monthly|月付/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Yearly|年付/ }).first()).toBeVisible();

  await page.goto("/cards");
  await page.waitForURL(/\/cards/);
});

test("authenticated checkout validates plan input", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);

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
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);

  await billingAction(page.request, { action: "reset" });
  const backdated = await billingAction(page.request, {
    action: "backdateTrial",
    daysAgo: 10,
  });
  expect(backdated.billing?.trialActive).toBe(false);
  expect(backdated.billing?.isActive).toBe(false);

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(402);

  await page.goto("/cards");
  await page.waitForURL(/\/settings\?/);
  await expect(page).toHaveURL(/upgrade=required/);
});

test("active paid subscription unlocks paid routes and pro API gate", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);

  await billingAction(page.request, { action: "reset" });
  await billingAction(page.request, { action: "backdateTrial", daysAgo: 10 });
  const activated = await billingAction(page.request, {
    action: "simulateWebhook",
    status: "active",
    plan: "pro_yearly",
  });
  expect(activated.billing?.isActive).toBe(true);
  expect(activated.billing?.plan).toBe("pro");
  expect(activated.billing?.subscriptionStatus).toBe("active");

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(400);

  await page.goto("/cards");
  await page.waitForURL(/\/cards/);
});

test("checkout blocks creating a second subscription when one is already active", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);

  await billingAction(page.request, { action: "reset" });
  await billingAction(page.request, { action: "backdateTrial", daysAgo: 10 });
  await billingAction(page.request, {
    action: "simulateWebhook",
    status: "active",
    plan: "pro_yearly",
  });

  const checkout = await page.request.post("/api/paddle/checkout", {
    data: { plan: "pro_plus_monthly" },
  });
  expect(checkout.status()).toBe(409);
  const payload = (await checkout.json()) as { error?: string; code?: string };
  expect(payload.code).toBe("active_subscription_exists");
  expect(payload.error ?? "").toContain("Manage billing");
});

test("billing remains active when a newer inactive row exists for a different subscription", async ({
  page,
  request,
}) => {
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);

  await billingAction(page.request, { action: "reset" });
  await billingAction(page.request, { action: "backdateTrial", daysAgo: 10 });
  const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const activeSubscriptionId = `sub_test_active_main_${idSuffix}`;
  const canceledSubscriptionId = `sub_test_canceled_old_${idSuffix}`;

  const active = await billingAction(page.request, {
    action: "simulateWebhook",
    subscriptionId: activeSubscriptionId,
    status: "active",
    plan: "pro_yearly",
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
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);

  await billingAction(page.request, { action: "reset" });
  await billingAction(page.request, { action: "backdateTrial", daysAgo: 10 });
  const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const subscriptionId = `sub_test_stale_guard_${idSuffix}`;

  const fresh = await billingAction(page.request, {
    action: "simulateWebhook",
    subscriptionId,
    status: "active",
    plan: "pro_yearly",
    occurredAtOffsetDays: 0,
  });
  expect(fresh.billing?.isActive).toBe(true);
  expect(fresh.billing?.subscriptionStatus).toBe("active");

  const stale = await billingAction(page.request, {
    action: "simulateWebhook",
    subscriptionId,
    status: "canceled",
    plan: "pro_yearly",
    occurredAtOffsetDays: -2,
    subscriptionUpdatedAtOffsetDays: -2,
  });
  expect(stale.billing?.isActive).toBe(true);
  expect(stale.billing?.subscriptionStatus).toBe("active");

  const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
  expect(proApi.status()).toBe(400);
});

test("subscription status transitions enforce access correctly", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);
  await billingAction(page.request, { action: "reset" });
  await billingAction(page.request, { action: "backdateTrial", daysAgo: 10 });

  const cases: Array<{
    status: "trialing" | "active" | "past_due" | "canceled" | "expired";
    expectedActive: boolean;
    expectedProApiStatus: number;
  }> = [
    { status: "trialing", expectedActive: true, expectedProApiStatus: 400 },
    { status: "active", expectedActive: true, expectedProApiStatus: 400 },
    { status: "past_due", expectedActive: false, expectedProApiStatus: 402 },
    { status: "canceled", expectedActive: false, expectedProApiStatus: 402 },
    { status: "expired", expectedActive: false, expectedProApiStatus: 402 },
  ];

  for (const row of cases) {
    const result = await billingAction(page.request, {
      action: "simulateWebhook",
      status: row.status,
      plan: "pro_monthly",
    });
    expect(result.billing?.subscriptionStatus).toBe(row.status);
    expect(Boolean(result.billing?.isActive)).toBe(row.expectedActive);

    const proApi = await page.request.post("/api/ai/edit-cards", { data: {} });
    expect(proApi.status()).toBe(row.expectedProApiStatus);
  }
});

test("renewal and expiration updates are reflected after webhook sequence", async ({ page, request }) => {
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);
  await billingAction(page.request, { action: "reset" });
  await billingAction(page.request, { action: "backdateTrial", daysAgo: 10 });

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
  await signInWithMagicLink(page, request, "/settings");
  await page.waitForURL(/\/settings/);

  const response = await page.request.post("/api/paddle/checkout", {
    data: { plan: "pro_monthly" },
  });
  if (response.status() !== 200) {
    const detail = await response.text();
    throw new Error(`Real Paddle checkout contract failed (${response.status()}): ${detail}`);
  }
  const payload = (await response.json()) as { checkoutUrl?: string };
  expect(typeof payload.checkoutUrl).toBe("string");
  expect(payload.checkoutUrl ?? "").toMatch(/^https?:\/\//);
});

test("billing APIs reject unauthenticated requests", async ({ request }) => {
  const checkoutResponse = await request.post("/api/paddle/checkout", {
    data: { plan: "pro_yearly" },
  });
  expect(checkoutResponse.status()).toBe(401);

  const portalResponse = await request.post("/api/paddle/portal");
  expect(portalResponse.status()).toBe(401);
});

test("pricing page mentions monthly, yearly, and the 3-day trial", async ({ request }) => {
  const response = await request.get("/pricing");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/monthly/i);
  expect(html).toMatch(/yearly/i);
  expect(html).toMatch(/3-day/i);
});
