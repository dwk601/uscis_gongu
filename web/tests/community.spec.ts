import { expect, test } from "@playwright/test"

test("filtered community remains readable when its summary fails", async ({
  page,
}) => {
  let fail = false
  let filter = ""
  await page.route("**/api/x/uscis/case**", async (route) => {
    if (fail)
      return route.fulfill({ status: 503, json: { message: "Unavailable" } })
    return route.fulfill({
      json: {
        forms: [
          { form: "I-485", name: "Green card" },
          { form: "I-130", name: "Family petition" },
        ],
        summary: { eligibleReports: 31416, years: [1997, 2025] },
      },
    })
  })
  await page.route("**/api/collections/post_feed/records**", async (route) => {
    filter = new URL(route.request().url()).searchParams.get("filter") || ""
    return route.fulfill({
      json: {
        page: 1,
        perPage: 20,
        items: [
          {
            id: "abcdefghijklmno",
            title: "A timeline",
            body: "Hello",
            form: "I-485",
            author_name: "A",
            created: "2025-01-01 00:00:00Z",
            votes: 0,
            comments: 0,
          },
        ],
      },
    })
  })
  await page.goto("/community?form=I-485")
  await expect(
    page.getByText("31,416 VisaJourney timeline reports for I-485 · 1997–2025")
  ).toBeVisible()
  await expect(page.getByText("A timeline")).toBeVisible()
  expect(filter).toContain("I-485")
  fail = true
  await page.getByLabel("Form", { exact: true }).selectOption("I-130")
  await expect(page.getByText("A timeline")).toBeVisible()
  await page.getByRole("link", { name: "Share my timeline" }).click()
  await expect(page).toHaveURL(/\/login/)
  expect(new URL(page.url()).searchParams.get("redirect")).toContain(
    "form=I-130"
  )
  expect(new URL(page.url()).searchParams.get("redirect")).toContain(
    "compose=true"
  )
})
