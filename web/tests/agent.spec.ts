import { expect, test } from "@playwright/test"

test("Ask gongu signs in, renders data, retains route state, and handles its budget", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-07-02T12:00:00Z"))
  await page.setViewportSize({ width: 390, height: 844 })
  const record = {
    id: "member000000001",
    collectionId: "users",
    collectionName: "users",
    name: "Member",
    email: "member@example.com",
  }
  const token = `e30.${Buffer.from(JSON.stringify({ id: record.id, exp: 4102444800 })).toString("base64url")}.signature`
  await page.route("**/api/collections/users/auth-with-password", (route) =>
    route.fulfill({ json: { token, record } })
  )
  await page.route("**/api/x/uscis/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/forms"))
      return route.fulfill({
        json: {
          forms: [{ form: "I-485", name: "Green card", featured: true }],
        },
      })
    if (path.endsWith("/bulletin"))
      return route.fulfill({ json: { categories: [], series: [] } })
    if (path.endsWith("/community"))
      return route.fulfill({ json: { series: [] } })
    return route.fulfill({ json: { name: "Green card", official: [] } })
  })
  const answer = {
    kind: "answer",
    blocks: [
      { type: "paragraph", text: "<b>Reported data, not a guarantee.</b>" },
      {
        type: "paragraph",
        text: "Waits vary by case.\n\nThese figures are descriptive.",
      },
      {
        type: "stat",
        label: "Completed cases",
        value: 12500,
        unit: "cases",
        period: "Jan–Mar 2026",
        sourceId: "official",
      },
      {
        type: "date_estimate",
        form: "I-485",
        series: "Family",
        filingDate: "2025-10-01",
        medianMonths: 8,
        estimatedDate: "2026-06-01",
        period: "Jan–Mar 2026",
        sourceId: "official",
      },
      {
        type: "bulletin_cutoff",
        category: "EB2",
        country: "INDIA",
        chart: "final_action",
        month: "2026-07",
        status: "date",
        cutoff: "2014-01-01",
        sourceId: "bulletin",
      },
      {
        type: "table",
        columns: [
          { key: "form", label: "Form" },
          { key: "median", label: "Median months" },
        ],
        rows: [{ form: "I-485", median: 8 }],
        sourceId: "official",
      },
    ],
    sources: [
      {
        id: "official",
        label: "Official USCIS",
        href: "/trends?form=N-400",
        period: "Jan–Mar 2026",
      },
      {
        id: "bulletin",
        label: "Visa bulletin",
        href: "/bulletin?category=EB2&chart=final_action",
        period: "Jul 2026",
      },
      { id: "unsafe", label: "External", href: "//example.com", period: null },
    ],
    budget: {
      limit: 10000,
      remaining: 8500,
      questionLimit: 2000,
      resetsAt: "2026-07-03T00:00:00Z",
    },
  }
  const stream = (body: unknown) => ({
    contentType: "text/event-stream",
    body: `event: status\ndata: {"message":"Thinking…"}\n\nevent: answer\ndata: ${JSON.stringify(body)}\n\n`,
  })
  let requests = 0
  let release: (() => void) | undefined
  await page.route("**/api/x/agent/ask", async (route) => {
    requests++
    expect(route.request().method()).toBe("POST")
    expect(route.request().headers().authorization).toBe(token)
    if (requests === 1) {
      expect(route.request().postDataJSON()).toEqual({
        question: "What does the latest data say?",
      })
      return route.fulfill(stream(answer))
    }
    if (requests === 2)
      return route.fulfill({
        status: 429,
        json: {
          status: 429,
          message: "You have used today's Ask gongu budget.",
          data: {
            reason: {
              code: "daily_budget_exhausted",
              message: "Budget spent.",
            },
            remaining: 0,
            resetsAt: "2026-07-03T00:00:00Z",
          },
        },
      })
    if (requests === 3)
      return route.fulfill({
        status: 429,
        json: {
          status: 429,
          message: "Ask gongu is busy. Please try again in a moment.",
          data: { reason: { code: "busy" } },
        },
      })
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return route.fulfill(
      stream({
        ...answer,
        blocks: [{ type: "paragraph", text: "Late answer" }],
      })
    )
  })

  await page.goto("/trends?form=I-485")
  await expect(page.getByRole("main").locator("..")).toHaveCSS(
    "padding-bottom",
    "72px"
  )
  const launcher = page.getByRole("button", { name: "Ask gongu", exact: true })
  await launcher.click()
  const dialog = page.getByRole("dialog", { name: "Ask gongu", exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("textbox")).toHaveCount(0)
  const signIn = dialog.getByRole("link", { name: "Sign in" })
  const href = await signIn.getAttribute("href")
  expect(new URL(href!, "http://gongu.test").searchParams.get("redirect")).toBe(
    "/trends?form=I-485"
  )
  await signIn.click()
  await expect(launcher).toHaveCount(0)
  await page.getByLabel("Email").fill("member@example.com")
  await page.getByLabel("Password").fill("password123")
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click()
  await expect(page).toHaveURL(/\/trends\?form=I-485/)
  await launcher.click()
  const question = dialog.getByRole("textbox", { name: "Your question" })
  await expect(question).toBeFocused()
  await expect(question).toHaveCSS("font-size", "16px")
  await question.fill("  What does the latest data say?  ")
  await dialog.getByRole("button", { name: "Ask", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(question).toHaveValue("")
  await expect(
    dialog.getByText("What does the latest data say?", { exact: true })
  ).toBeVisible()
  await expect(dialog.getByRole("status")).toHaveText("Answer ready.")
  await expect(question).toBeFocused()
  await expect(
    dialog.getByRole("heading", { name: "Completed cases" })
  ).toBeVisible()
  await expect(dialog.getByText("12,500 cases", { exact: true })).toBeVisible()
  await expect(
    dialog.getByRole("heading", { name: "Estimated around Jun 2026" })
  ).toBeVisible()
  await expect(
    dialog.getByText("Past the typical wait.", { exact: true })
  ).toBeVisible()
  await expect(dialog.locator(".estimate")).toContainText("I-485 · Family")
  await expect(
    dialog.getByRole("heading", { name: "Jan 1, 2014" })
  ).toBeVisible()
  await expect(
    dialog.getByRole("table", { name: "Official USCIS" })
  ).toBeVisible()
  await expect(dialog.getByRole("row", { name: "I-485 8" })).toBeVisible()
  await expect(
    dialog
      .getByRole("paragraph")
      .filter({ hasText: "<b>Reported data, not a guarantee.</b>" })
  ).toBeVisible()
  await expect(
    dialog.getByRole("paragraph").filter({ hasText: "Waits vary by case." })
  ).toHaveText("Waits vary by case.\n\nThese figures are descriptive.")
  await expect(dialog.locator("b")).toHaveCount(0)
  await expect(dialog.getByRole("link", { name: "External" })).toHaveCount(0)
  await expect(
    dialog.getByText("8,500 / 10,000 tokens remaining")
  ).toBeVisible()
  await expect(dialog.locator("time")).toHaveAttribute(
    "datetime",
    "2026-07-03T00:00:00Z"
  )
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden")
  expect(await page.evaluate("document.documentElement.scrollWidth")).toBe(390)
  expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(844 * 0.85)

  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(dialog).toHaveCSS("width", "380px")
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByText("Bulletin")
    .click()
  await expect(page).toHaveURL(/\/bulletin/)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("12,500 cases", { exact: true })).toBeVisible()
  await dialog.getByRole("link", { name: /Official USCIS/ }).click()
  await expect(page).toHaveURL(/\/trends\?form=N-400/)
  await expect(dialog.getByText("12,500 cases", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  await expect(dialog).toHaveCSS("background-color", "rgb(39, 39, 36)")
  await question.fill("What about my next question?")
  await dialog.getByRole("button", { name: "Ask", exact: true }).click()
  await expect(dialog.getByRole("alert")).toHaveText(
    "You have used today's Ask gongu budget."
  )
  await expect(question).toHaveValue("What about my next question?")
  await expect(dialog.getByText("0 tokens remaining")).toBeVisible()
  await expect(dialog.getByText(/Resets Jul 3, 12:00 AM UTC/)).toBeVisible()
  expect(requests).toBe(2)
  await dialog.getByRole("button", { name: "Ask", exact: true }).click()
  await expect(dialog.getByRole("alert")).toHaveText(
    "Ask gongu is busy. Please try again in a moment."
  )
  await expect(question).toHaveValue("What about my next question?")
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  await expect(launcher).toBeFocused()
  await expect(launcher).toHaveAttribute("aria-expanded", "false")
  await launcher.click()
  await dialog.getByRole("button", { name: "Ask", exact: true }).focus()
  await page.keyboard.down("Enter")
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused()
  await expect.poll(() => !!release).toBe(true)
  await page.keyboard.down("Enter")
  await page.keyboard.up("Enter")
  await expect(dialog.getByRole("status")).toHaveText("Asking gongu…")
  await expect(question).toHaveValue("")
  await expect(dialog.locator(".agent-thinking")).toHaveText("Asking gongu…")
  await dialog.getByRole("button", { name: "Cancel" }).click()
  release!()
  await expect(dialog.getByRole("status")).toHaveText("Question canceled.")
  await expect(
    dialog.getByRole("button", { name: "Ask", exact: true })
  ).toBeFocused()
  await expect(question).toHaveValue("What about my next question?")
  release = undefined
  await dialog.getByRole("button", { name: "Ask", exact: true }).click()
  await expect.poll(() => !!release).toBe(true)
  await page.getByLabel("Account menu").click()
  await page.getByRole("button", { name: "Sign out" }).click()
  release!()
  await expect(dialog.getByRole("link", { name: "Sign in" })).toBeVisible()
  await expect(dialog.getByRole("textbox")).toHaveCount(0)
  await expect(dialog.getByText("Late answer")).toHaveCount(0)
  await expect(dialog.getByText("12,500 cases", { exact: true })).toHaveCount(0)

  await page.route("**/api/x/agent/ask", (route) =>
    route.fulfill({
      status: 401,
      json: { status: 401, message: "The session has expired.", data: {} },
    })
  )
  await page.route("**/api/collections/users/auth-refresh", (route) =>
    route.fulfill({
      status: 401,
      json: { status: 401, message: "The session has expired.", data: {} },
    })
  )
  await dialog.getByRole("link", { name: "Sign in" }).click()
  await page.getByLabel("Email").fill("member@example.com")
  await page.getByLabel("Password").fill("password123")
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click()
  await launcher.click()
  await question.fill("Is my session still active?")
  await dialog.getByRole("button", { name: "Ask", exact: true }).click()
  await expect(dialog.getByRole("link", { name: "Sign in" })).toBeVisible()
  await expect(page.getByLabel("Account menu")).toHaveCount(0)
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in" })
  ).toBeVisible()
  await expect(
    dialog.getByText("Your session ended. Please sign in again.")
  ).toBeVisible()
})
