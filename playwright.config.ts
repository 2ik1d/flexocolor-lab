import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:4175", trace: "retain-on-failure" },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4175 --strictPort",
    url: `http://127.0.0.1:4175${process.env.E2E_BASE_PATH || "/"}`,
    env: { BASE_PATH: process.env.E2E_BASE_PATH || "/" },
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    {
      name: "webkit",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
  ],
});
