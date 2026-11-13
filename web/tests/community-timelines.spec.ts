import { expect, test } from "./fixtures.js"

test("visa routes remain usable across form history", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let requests = 0
  const forms = [
    { form: "N-400", name: "Citizenship", featured: true, defaultSeries: "" },
    ...Array.from({ length: 12 }, (_, i) => ({
      form: `I-${100 + i}`,
      name: `Featured application ${i}`,
      featured: true,
      defaultSeries: "",
    })),
    {
      form: "I-999",
      name: "Other application",
      featured: false,
      defaultSeries: "",
    },
    {
      form: "I-485",
      name: "Green card application",
      featured: true,
      defaultSeries: "",
    },
    {
      form: "I-998",
      name: "Additional application",
      featured: false,
      defaultSeries: "",
    },
  ]
  const point = (p50: number | null) => ({
    filingYear: 2022,
    sampleSize: 100,
    completed: 80,
    pending: 20,
    pendingShare: 0.2,
    p10: p50 == null ? null : 304.4,
    p50,
    p90: p50 == null ? null : 913.2,
  })
  await page.route("**/api/x/uscis/**", async (route) => {
    requests++
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/forms")) return route.fulfill({ json: { forms } })
    if (path.endsWith("/h1b-pay")) return route.fulfill({ json: { years: [] } })
    const form = path.includes("N-400")
      ? "N-400"
      : path.includes("I-999")
        ? "I-999"
        : "I-485"
    if (path.endsWith("/community")) {
      const values =
        form === "N-400"
          ? [
              ["IR-1/CR-1", 608.8],
              ["K1", 456.6],
              ["K3", null],
            ]
          : [
              ["K3", 365.28],
              ["K1", 608.8],
            ]
      return route.fulfill({
        json: {
          form,
          series: values.map(([visaType, median]) => ({
            visaType,
            source: "VisaJourney",
            stage: "aos",
            meaning: "Application filed → decision",
            points: [point(median as number | null)],
          })),
        },
      })
    }
    return route.fulfill({
      json: {
        form,
        name: forms.find((f) => f.form === form)?.name,
        official: [],
      },
    })
  })
  await page.goto("/trends?form=N-400")
  await expect(page.getByRole("button", { name: /IR-1\/CR-1/ })).toBeVisible()
  await expect(page.getByRole("button", { name: /K1|K-1/ })).toBeVisible()
  const journey = page.getByRole("group", { name: "Journey", exact: true })
  const selectedJourney = journey.getByRole("button", {
    name: "Green card holders",
  })
  const initialURL = page.url()
  const beforeNavigation = requests
  await selectedJourney.focus()
  await page.keyboard.press("ArrowRight")
  await expect(journey.getByRole("button", { name: "Investors" })).toBeFocused()
  await expect(selectedJourney).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Home")
  await expect(journey.getByRole("button", { name: "Students" })).toBeFocused()
  await page.keyboard.press("End")
  await expect(journey.getByRole("button", { name: "All forms" })).toBeFocused()
  await expect(journey.locator('button[tabindex="0"]')).toHaveCount(1)
  expect(page.url()).toBe(initialURL)
  expect(requests).toBe(beforeNavigation)
  await page.getByRole("button", { name: "All forms" }).click()
  await expect(page.getByRole("button", { name: /I-485/ })).toBeVisible()
  const featured = page.getByRole("group", { name: "Featured forms" })
  const citizenship = featured.getByRole("button", { name: /Citizenship/ })
  const allFormsURL = page.url()
  const beforeFormNavigation = requests
  await citizenship.focus()
  await page.keyboard.press("ArrowRight")
  await expect(
    featured.getByRole("button", { name: /Featured application 0 / })
  ).toBeFocused()
  await page.keyboard.press("End")
  await expect(
    featured.getByRole("button", { name: /Green card application/ })
  ).toBeFocused()
  await page.keyboard.press("Home")
  await expect(citizenship).toBeFocused()
  await expect(citizenship).toHaveAttribute("aria-pressed", "true")
  await expect(featured.locator('button[tabindex="0"]')).toHaveCount(1)
  expect(page.url()).toBe(allFormsURL)
  expect(requests).toBe(beforeFormNavigation)
  await page.getByRole("button", { name: /Browse all other forms/ }).click()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel("Search by name or form number")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByLabel("Search by name or form number")).toBeVisible()
  const search = page.getByLabel("Search by name or form number")
  await search.fill("Citizenship")
  const duplicates = page.getByRole("button", { name: /Citizenship.*Selected/ })
  await expect(duplicates).toHaveCount(2)
  for (const duplicate of await duplicates.all())
    await expect(duplicate).toHaveAttribute("aria-pressed", "true")
  for (const [key, caret] of [
    ["ArrowLeft", 10],
    ["ArrowRight", 11],
  ] as const) {
    await search.press(key)
    await expect(search).toBeFocused()
    expect(await search.evaluate((input) => input.selectionStart)).toBe(caret)
  }
  for (const key of ["Home", "End", "ArrowUp", "ArrowDown"]) {
    await search.press(key)
    await expect(search).toBeFocused()
    await expect(search).toHaveValue("Citizenship")
  }
  expect(page.url()).toBe(allFormsURL)
  expect(requests).toBe(beforeFormNavigation)
  await page.getByRole("button", { name: "Clear search" }).click()
  await expect(search).toHaveValue("")
  await page.getByLabel("Search by name or form number").fill("I-999")
  await page.evaluate("window.scrollTo(0, 150)")
  expect(await page.evaluate<number>("window.scrollY")).toBeGreaterThan(0)
  await page.getByRole("button", { name: /Other application/ }).click()
  await expect(page).toHaveURL(/form=I-999/)
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport()
  await expect
    .poll(() => page.evaluate<number>("window.scrollY"))
    .toBeGreaterThan(0)
  const changeForm = page.getByRole("button", { name: /Change form/ })
  await expect(changeForm).toBeFocused()
  await expect
    .poll(() =>
      page.evaluate(`(() => {
    const element = document.querySelector('.trend-form-controls .form-summary')
    const box = element.getBoundingClientRect()
    const header = document.querySelector('.site-header').getBoundingClientRect()
    return box.top >= header.bottom && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })()`)
    )
    .toBe(true)
  await page.goBack()
  await page.goForward()
  await page.getByRole("button", { name: /Change form/ }).click()
  expect(
    await page.evaluate<boolean>(
      "document.querySelector('.trend-form-controls .form-summary').getBoundingClientRect().bottom <= document.querySelector('.trend-form-controls .form-inline-featured').getBoundingClientRect().top"
    )
  ).toBe(true)
  const selectedOther = page.getByRole("button", {
    name: /Other application.*Selected/,
  })
  await expect(selectedOther).toBeVisible()
  await expect(selectedOther).toBeFocused()
  const selectedURL = page.url()
  const selectedHistory = await page.evaluate("history.length")
  const beforeReselect = requests
  await selectedOther.press("ArrowRight")
  await expect(
    page.getByRole("button", { name: /Additional application/ })
  ).toBeFocused()
  await expect(selectedOther).toHaveAttribute("aria-pressed", "true")
  await selectedOther.press(" ")
  await expect(changeForm).toBeFocused()
  await expect(selectedOther).toHaveCount(0)
  expect(page.url()).toBe(selectedURL)
  expect(await page.evaluate("history.length")).toBe(selectedHistory)
  expect(requests).toBe(beforeReselect)
  await changeForm.click()
  await expect(selectedOther).toBeFocused()
  await page.getByRole("button", { name: /I-485/ }).click()
  await page.getByRole("button", { name: /K3|K-3/ }).click()
  await page.goBack()
  await page.goBack()
  await expect(page.getByRole("button", { name: /IR-1\/CR-1/ })).toBeVisible()
  const routes = page.getByRole("group", { name: "Visa route" })
  await expect(routes.getByRole("button", { name: /K3|K-3/ })).toHaveCount(0)
  await expect(routes.getByRole("button", { pressed: true })).toHaveCount(1)
  await routes.getByRole("button", { name: /K1|K-1/ }).click()
  await expect(page.getByText("15 months", { exact: true })).toBeVisible()
  const chart = page
    .getByRole("heading", { name: "Community wait times · months" })
    .locator("..")
  await chart.getByText("Data", { exact: true }).click()
  await expect(
    chart.getByRole("row", { name: /2022\s+15\s+10\s+30/ })
  ).toBeVisible()
  await page.goto("/trends?journey=workers&form=I-485&insight=h1b-pay")
  await expect(page.getByText("Nothing to show yet.")).toBeVisible()
  const workers = journey.getByRole("button", { name: "Workers", exact: true })
  await expect(workers).toHaveAttribute("aria-pressed", "true")
  const beforeJourneyReselect = requests
  await workers.press("Enter")
  await expect(page).not.toHaveURL(/insight=/)
  await expect(workers).toHaveAttribute("aria-pressed", "true")
  expect(requests).toBe(beforeJourneyReselect)
})
