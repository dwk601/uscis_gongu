import { expect, test } from "@playwright/test"

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
  await page.getByRole("button", { name: "Check wait time" }).click()
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

test("student insights keep history and distinguish uncovered weeks", async ({
  page,
}) => {
  await page.route("**/api/x/uscis/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/forms"))
      return route.fulfill({
        json: {
          forms: [
            {
              form: "I-765",
              name: "Work permit",
              featured: true,
              defaultSeries: "all",
            },
          ],
        },
      })
    if (path.endsWith("/student-posts"))
      return route.fulfill({
        json: {
          from: "2024-01-01",
          to: "2024-01-14",
          topics: {
            sevis: { posts: 5 },
            cpt: { posts: 0 },
            policy: { posts: 0 },
          },
          weeks: [
            {
              week: "2024-01-01",
              covered: false,
              all: null,
              sevis: null,
              cpt: null,
              policy: null,
              z: { sevis: null, cpt: null, policy: null },
            },
            {
              week: "2024-01-08",
              covered: true,
              all: 5,
              sevis: 5,
              cpt: 0,
              policy: 0,
              z: { sevis: 3, cpt: null, policy: null },
            },
          ],
        },
      })
    if (path.endsWith("/community"))
      return route.fulfill({
        json: {
          series: [
            {
              visaType: "F-1",
              meaning: "Filed to decision",
              points: [
                {
                  filingYear: 2024,
                  p50: 100,
                  p10: 50,
                  p90: 150,
                  completed: 40,
                  sampleSize: 50,
                  pendingShare: 0.2,
                },
              ],
            },
          ],
        },
      })
    return route.fulfill({ json: { name: "Work permit", official: [] } })
  })
  await page.goto("/trends?journey=students&form=I-765")
  await expect(
    page.getByRole("button", { name: "Came on F-1 · not OPT data" })
  ).toBeVisible()
  await page.getByRole("button", { name: "What students post about" }).click()
  await expect(page).toHaveURL(/insight=student-posts/)
  await expect(
    page.getByRole("row", { name: /2024-01-01 Not covered/ })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "More posts than usual" })
  ).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole("button", { name: "Came on F-1 · not OPT data" })
  ).toBeVisible()
  await page.goForward()
  await expect(
    page.getByRole("heading", { name: "What students post about" })
  ).toBeVisible()
})
