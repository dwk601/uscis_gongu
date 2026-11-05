import { createServer } from "node:net"
import { defineConfig } from "@playwright/test"

async function available(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)))
  })
}
const requested = process.env.PLAYWRIGHT_PORT
const ports = requested
  ? [Number(requested)]
  : Array.from({ length: 10 }, (_, i) => 8149 - i)
let port: number | undefined
for (const candidate of ports) {
  if (
    Number.isInteger(candidate) &&
    candidate >= 8140 &&
    candidate <= 8149 &&
    (requested !== undefined || (await available(candidate)))
  ) {
    port = candidate
    break
  }
}
if (port === undefined)
  throw new Error("No available Playwright port in 8140–8149")
process.env.PLAYWRIGHT_PORT = String(port)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./tests",
  reporter: "line",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
})
