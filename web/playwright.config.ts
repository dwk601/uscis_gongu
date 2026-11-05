import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:8149",
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 8149 --strictPort",
    url: "http://127.0.0.1:8149",
    reuseExistingServer: false,
  },
})
