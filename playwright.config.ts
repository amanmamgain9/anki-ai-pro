import { defineConfig } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      E2E_AUTH_ENABLED: "1",
      NEXT_PUBLIC_E2E_AUTH_ENABLED: "1",
      NEXTAUTH_URL: baseURL,
      MAGIC_LINK_EMAIL_MODE: "return_link",
      E2E_TEST_SECRET: "playwright-local-secret",
    },
  },
});
