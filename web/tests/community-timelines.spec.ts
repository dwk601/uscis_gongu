import { expect, test } from "./fixtures.js"

test("visa routes remain usable across form history", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
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
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/forms")) return route.fulfill({ json: { forms } })
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
  await page.getByRole("button", { name: "All forms" }).click()
  await expect(page.getByRole("button", { name: /I-485/ })).toBeVisible()
  await page.getByRole("button", { name: /Browse all other forms/ }).click()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel("Search by name or form number")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByLabel("Search by name or form number")).toBeVisible()
  await page.getByLabel("Search by name or form number").fill("I-999")
  await page.evaluate(`(() => {
    const header = document.querySelector('.site-header')
    header.style.position = 'sticky'
    header.style.top = '0'
    header.style.zIndex = '10'
    document.documentElement.style.setProperty('--header-h', header.getBoundingClientRect().height + 'px')
  })()`)
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
})
