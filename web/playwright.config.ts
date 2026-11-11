import { createServer } from "node:net"
import { defineConfig } from "@playwright/test"

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string")
        return reject(new Error("No free port"))
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}
const requested = process.env.PLAYWRIGHT_PORT
const port = requested === undefined ? await freePort() : Number(requested)
if (!Number.isInteger(port) || port < 1 || port > 65535 || requested === "")
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535")
process.env.PLAYWRIGHT_PORT = String(port)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./tests",
  reporter: "line",
  use: {
    baseURL,
    browserName: "chromium",
    serviceWorkers: "block",
    timezoneId: "America/Los_Angeles",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
})
