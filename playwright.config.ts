import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 4,
  fullyParallel: true,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run dev -- --port 4173 --strictPort",
    env: {
      VITE_SUPABASE_URL: "https://web-fixture.supabase.co",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_fixture",
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
