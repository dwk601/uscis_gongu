import { expect, test } from "./fixtures.js"

test("signup requires private answers and returns to the original deep link", async ({
  page,
}) => {
  const record = {
    id: "newmember000001",
    collectionId: "users",
    collectionName: "users",
    name: "New member",
    email: "new@example.com",
  }
  const token = `e30.${Buffer.from(JSON.stringify({ id: record.id, exp: 4102444800 })).toString("base64url")}.signature`
  const deepLink = "/community?form=I-130&sort=top#timeline"
  const patches: unknown[] = []
  await page.route("**/api/collections/users/records", (route) => {
    expect(route.request().method()).toBe("POST")
    return route.fulfill({ json: record })
  })
  await page.route("**/api/collections/users/auth-with-password", (route) =>
    route.fulfill({ json: { token, record } })
  )
  await page.route("**/api/collections/users/auth-refresh", (route) =>
    route.fulfill({ json: { token, record } })
  )
  await page.route("**/api/collections/users/records/*", (route) => {
    expect(route.request().method()).toBe("PATCH")
    patches.push(route.request().postDataJSON())
    if (patches.length === 1)
      return route.fulfill({
        status: 503,
        json: { message: "Please try again." },
      })
    return route.fulfill({
      json: {
        ...record,
        seeking: ["none"],
        status: "none",
        country: patches.length === 3 ? "IN" : "none",
      },
    })
  })
  await page.route("**/api/collections/post_feed/records**", (route) =>
    route.fulfill({ json: { page: 1, perPage: 20, items: [] } })
  )
  await page.route("**/api/collections/votes/records**", (route) =>
    route.fulfill({ json: { page: 1, perPage: 500, items: [] } })
  )
  await page.route("**/api/x/uscis/**", (route) =>
    route.fulfill({
      json: {
        forms: [
          { form: "I-130", name: "Petition for a relative", featured: true },
        ],
        summary: { eligibleReports: 0, years: [] },
      },
    })
  )

  await page.goto(deepLink)
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click()
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click()
  await page.getByLabel("Display name").fill("New member")
  await page.getByLabel("Email").fill(record.email)
  await page.getByLabel("Password").fill("password123")
  await page
    .locator("form")
    .getByRole("button", { name: "Create account" })
    .click()
  await expect(page).toHaveURL(/\/welcome\?/)
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(deepLink)
  await expect(page.getByRole("button", { name: "Ask gongu" })).toHaveCount(0)

  await page.goto(deepLink)
  await expect(page).toHaveURL(/\/welcome\?/)
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(deepLink)

  const save = page.getByRole("button", { name: "Save and continue" })
  await save.click()
  await expect(
    page.getByText("Choose a case or N/A.", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Choose a status or N/A.", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Choose a country or region, or N/A.", { exact: true })
  ).toBeVisible()
  expect(patches).toEqual([])

  const seeking = page.getByRole("combobox", {
    name: "What cases are you looking for?",
  })
  await seeking.fill("I-765")
  await seeking.press("ArrowDown")
  await seeking.press("Enter")
  await seeking.fill("Nothing")
  await page
    .getByRole("option", { name: "Nothing right now (N/A)", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Remove I-765 · Work permit" })
  ).toHaveCount(0)
  await seeking.fill("I-130")
  await page
    .getByRole("option", {
      name: "I-130 · Petition for a relative",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("button", { name: "Remove Nothing right now (N/A)" })
  ).toHaveCount(0)
  await seeking.fill("Nothing")
  await page
    .getByRole("option", { name: "Nothing right now (N/A)", exact: true })
    .click()
  await seeking.press("Escape")
  await page
    .getByRole("combobox", { name: "Current immigration status" })
    .click()
  await page
    .getByRole("option", { name: "None / not applicable", exact: true })
    .click()
  const country = page.getByRole("combobox", {
    name: "Country or region you are from",
  })
  await country.fill("N/A")
  await country.press("Tab")
  await save.click()
  await expect(
    page.getByText("Choose a country or region, or N/A.", { exact: true })
  ).toBeVisible()
  expect(patches).toEqual([])
  await country.fill("N/A")
  await page
    .getByRole("option", { name: "Prefer not to say / N/A", exact: true })
    .click()
  await save.click()
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t save your answers."
  )
  await expect(country).toHaveValue("Prefer not to say / N/A")
  await expect(
    page.getByRole("button", { name: "Remove Nothing right now (N/A)" })
  ).toBeVisible()
  await save.click()
  await expect(page).toHaveURL(
    (url) => `${url.pathname}${url.search}${url.hash}` === deepLink
  )
  expect(patches).toEqual([
    { seeking: ["none"], status: "none", country: "none" },
    { seeking: ["none"], status: "none", country: "none" },
  ])
  const auth = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pocketbase_auth") || "{}")
  )
  expect(auth.record).toMatchObject({
    seeking: ["none"],
    status: "none",
    country: "none",
  })

  await page.getByLabel("Account menu").click()
  await page.getByRole("link", { name: "Settings", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true })
  ).toBeFocused()
  await expect(country).toHaveValue("Prefer not to say / N/A")
  await expect(
    page.getByRole("combobox", { name: "Current immigration status" })
  ).toHaveText("None / not applicable")
  await expect(
    page.getByRole("button", { name: "Remove Nothing right now (N/A)" })
  ).toBeVisible()
  await country.fill("India")
  await page.getByRole("option", { name: "India", exact: true }).click()
  await page.getByRole("button", { name: "Save answers", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("Your answers are saved.")
  expect(patches.at(-1)).toEqual({
    seeking: ["none"],
    status: "none",
    country: "IN",
  })
})
