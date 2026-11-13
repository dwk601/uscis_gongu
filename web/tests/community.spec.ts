import { expect, test } from "./fixtures.js"

test("filtered community remains readable when its summary fails", async ({
  page,
}) => {
  const submissions: string[] = []
  await page.route("**/api/collections/posts/records", async (route) => {
    submissions.push(route.request().postDataJSON().form)
    await route.fulfill({ json: { id: "abcdefghijklmno" } })
  })
  let fail = false
  let filter = ""
  let releaseCatalog: (() => void) | undefined
  let delayCatalog = false
  await page.route("**/api/x/uscis/case**", async (route) => {
    if (delayCatalog)
      await new Promise<void>((resolve) => {
        releaseCatalog = resolve
      })
    if (fail)
      return route.fulfill({ status: 503, json: { message: "Unavailable" } })
    return route.fulfill({
      json: {
        forms: [
          { form: "I-485", name: "Green card", featured: true },
          { form: "I-130", name: "Family petition", featured: true },
          { form: "I-999", name: "Other application", featured: false },
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
  const feedPicker = page.getByRole("group", {
    name: "Filter community by form",
  })
  await feedPicker.getByRole("button", { name: /Change form/ }).click()
  await feedPicker.getByRole("button", { name: /All forms/ }).click()
  await expect(page).not.toHaveURL(/form=I-485/)
  await feedPicker.getByRole("button", { name: /Change form/ }).click()
  await feedPicker.getByRole("button", { name: /Family petition/ }).click()
  await expect(page.getByText("A timeline")).toBeVisible()
  await page.getByRole("link", { name: "Share my timeline" }).click()
  await expect(page).toHaveURL(/\/login/)
  expect(new URL(page.url()).searchParams.get("redirect")).toContain(
    "form=I-130"
  )
  expect(new URL(page.url()).searchParams.get("redirect")).toContain(
    "compose=true"
  )
  fail = false
  delayCatalog = true
  await page.route("**/api/collections/users/auth-refresh", (route) =>
    route.fulfill({ status: 503 })
  )
  await page.route("**/api/collections/votes/records**", (route) =>
    route.fulfill({ json: { page: 1, perPage: 500, items: [] } })
  )
  await page.evaluate(() => {
    const token = `e30.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`
    localStorage.setItem(
      "pocketbase_auth",
      JSON.stringify({
        token,
        record: {
          id: "abcdefghijklmno",
          collectionId: "users",
          collectionName: "users",
          seeking: ["none"],
          status: "none",
          country: "none",
        },
      })
    )
  })
  await page.goto("/community?form=I-130&compose=true")
  const composerForm = page.getByRole("group", { name: "Form for your post" })
  await expect(
    composerForm.getByRole("button", { name: /I-130/ })
  ).toBeVisible()
  await expect.poll(() => !!releaseCatalog).toBe(true)
  releaseCatalog!()
  await expect(
    composerForm.getByRole("button", { name: /Family petition/ })
  ).toBeVisible()
  await expect(page).not.toHaveURL(/compose=/)
  await expect(page.getByText("Your post is about (optional)")).toBeVisible()
  await expect(page.getByText("Show posts for")).toBeVisible()
  await page.getByLabel("Title").fill("My timeline")
  await composerForm.getByRole("button", { name: /Change form/ }).click()
  await composerForm
    .getByRole("button", { name: /Browse all other forms/ })
    .click()
  await composerForm.getByLabel("Search by name or form number").fill("I-999")
  await composerForm.getByLabel("Search by name or form number").press("Enter")
  expect(submissions).toEqual([])
  await composerForm.getByRole("button", { name: /Other application/ }).click()
  await page.getByRole("button", { name: "Post", exact: true }).click()
  await expect.poll(() => submissions).toEqual(["I-999"])
  await page.getByRole("button", { name: "Share my timeline" }).click()
  await page.getByRole("button", { name: "Cancel" }).click()
  await page.reload()
  await expect(
    page.getByRole("group", { name: "Form for your post" })
  ).toHaveCount(0)
})
