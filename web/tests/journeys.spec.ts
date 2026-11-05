import { expect, test, type Page } from "@playwright/test"

test("journey navigation preserves an explicit series without refetching the form", async ({
  page,
}) => {
  let requests = 0
  await page.route("**/api/x/uscis/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/forms"))
      return route.fulfill({
        json: {
          forms: [
            {
              form: "I-485",
              name: "Green card",
              featured: true,
              defaultSeries: "family",
            },
            {
              form: "I-765",
              name: "Work permit",
              featured: true,
              defaultSeries: "aos",
            },
          ],
        },
      })
    if (path.endsWith("/community"))
      return route.fulfill({ json: { series: [] } })
    if (path.endsWith("/bulletin"))
      return route.fulfill({ json: { categories: [], series: [] } })
    if (path.endsWith("/I-485")) requests++
    return route.fulfill({
      json: {
        name: "Green card",
        official: [
          { id: "family", label: "Family", points: [] },
          { id: "employment", label: "Employment", points: [] },
        ],
      },
    })
  })
  await page.goto("/")
  await page.getByRole("button", { name: /Workers/ }).click()
  await page
    .getByRole("group", { name: "Case form" })
    .getByRole("button", { name: /I-485/ })
    .click()
  await page.locator('input[name="filed"]').fill("2024-01-15")
  await page.getByRole("button", { name: "See my estimate" }).click()
  await expect(page).toHaveURL(/journey=workers/)
  await expect(page).toHaveURL(/form=I-485/)
  await expect(page).toHaveURL(/filed=2024-01-15/)
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Employment", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await page
    .getByRole("group", { name: "Case category" })
    .getByRole("button", { name: "Family", exact: true })
    .click()
  await expect(page).toHaveURL(/series=family/)
  const before = requests
  await page
    .getByRole("group", { name: "Journey" })
    .getByRole("button", { name: "Family", exact: true })
    .click()
  await expect(page).toHaveURL(/journey=family/)
  await expect(page).toHaveURL(/form=I-485/)
  await expect(page).toHaveURL(/filed=2024-01-15/)
  await expect(page).toHaveURL(/series=family/)
  await expect(
    page
      .getByRole("group", { name: "Journey" })
      .getByRole("button", { name: "Family", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  expect(requests).toBe(before)
})

test("journey rail leaves room for focus rings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockUscis(page)
  await page.goto("/trends?form=I-485&journey=all")
  const rooms = await page
    .getByRole("group", { name: "Journey" })
    .evaluate((rail) =>
      [...rail.querySelectorAll("button")].map((button) => {
        button.focus()
        const bounds = rail.getBoundingClientRect()
        const box = button.getBoundingClientRect()
        return {
          top: box.top - bounds.top,
          left: box.left - bounds.left,
          right: bounds.right - box.right,
          bottom: bounds.bottom - box.bottom,
        }
      })
    )
  // A 3px focus outline sits 3px outside each focused button.
  for (const sides of rooms)
    expect(Math.min(...Object.values(sides))).toBeGreaterThanOrEqual(6)
})

test("an unknown series falls back to the journey's preferred series", async ({
  page,
}) => {
  await mockUscis(page)
  await page.goto("/trends?form=I-485&journey=workers&series=missing")
  await expect(
    page
      .getByRole("group", { name: "Case category" })
      .getByRole("button", { name: "Employment", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
})

test("the All forms card fills the mobile journey row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockUscis(page)
  await page.goto("/")
  const widths = await page
    .getByRole("group", { name: "Journey" })
    .evaluate((group) => ({
      row: group.getBoundingClientRect().width,
      allForms: group.lastElementChild?.getBoundingClientRect().width ?? 0,
    }))
  expect(widths.allForms).toBeCloseTo(widths.row, 0)
})

async function mockUscis(page: Page) {
  await page.route("**/api/x/uscis/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/forms"))
      return route.fulfill({
        json: {
          forms: [
            {
              form: "I-485",
              name: "Green card",
              featured: true,
              defaultSeries: "family",
            },
          ],
        },
      })
    if (path.endsWith("/community"))
      return route.fulfill({ json: { series: [] } })
    if (path.endsWith("/bulletin"))
      return route.fulfill({ json: { categories: [], series: [] } })
    return route.fulfill({
      json: {
        name: "Green card",
        official: [
          { id: "family", label: "Family", points: [] },
          { id: "employment", label: "Employment", points: [] },
        ],
      },
    })
  })
}
