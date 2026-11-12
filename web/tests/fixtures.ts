import { test as base, expect, type Page, type Route } from "@playwright/test"

export { expect }

export const test = base.extend({
  page: async ({ page, context, baseURL }, runPage) => {
    if (!baseURL)
      throw new Error("A base URL is required for the network guard")
    const origin = new URL(baseURL).origin
    const counts = {
      analytics: 0,
      nonGET: 0,
      unmockedAPI: 0,
      fulfilledMutations: 0,
      prohibitedForwards: 0,
    }

    const blockExternal = async (route: Route) => {
      const url = new URL(route.request().url())
      if (url.hostname === "analytics.gongu.xyz") {
        counts.analytics++
        await route.abort()
        return true
      }
      if (url.origin !== origin) {
        await route.abort()
        return true
      }
      return false
    }

    await context.route("**/*", async (route) => {
      if (await blockExternal(route)) return
      const request = route.request()
      if (request.method() !== "GET") {
        counts.nonGET++
        return route.abort()
      }
      if (new URL(request.url()).pathname.startsWith("/api/")) {
        counts.unmockedAPI++
        return route.abort()
      }
      return route.continue()
    })

    const originalRoute = page.route.bind(page)
    page.route = ((url, handler, options) =>
      originalRoute(
        url,
        async (route, request) => {
          if (await blockExternal(route)) return
          const guarded = new Proxy(route, {
            get(target, property) {
              if (property === "continue" || property === "fetch") {
                return async () => {
                  counts.prohibitedForwards++
                  await target.abort()
                  throw new Error("Test routes must not forward requests")
                }
              }
              if (property === "fulfill") {
                return async (...args: Parameters<Route["fulfill"]>) => {
                  await target.fulfill(...args)
                  if (request.method() !== "GET") counts.fulfilledMutations++
                }
              }
              const value = Reflect.get(target, property, target)
              return typeof value === "function" ? value.bind(target) : value
            },
          })
          await handler(guarded, request)
        },
        options
      )) as Page["route"]

    await runPage(page)
    console.log(`Network guard: ${JSON.stringify(counts)}`)
    expect(counts.prohibitedForwards).toBe(0)
    expect(counts.unmockedAPI).toBe(0)
    expect(counts.nonGET).toBe(0)
  },
})
