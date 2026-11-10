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
  await page.goto("/trends?journey=workers&form=I-485&filed=2024-01-15")
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
  let redditRequests = 0
  const description = "Application for Employment Authorization (All Other)"
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
            {
              form: "I-129",
              name: "Work petition",
              featured: true,
              defaultSeries: "work",
            },
          ],
        },
      })
    if (path.endsWith("/reddit")) {
      redditRequests++
      return route.fulfill({
        json: {
          officialDescription: description,
          series: [
            {
              caseType: "opt",
              premium: null,
              points: [
                {
                  filedMonth: "2026-05-01",
                  approvedReports: 80,
                  p10Days: 30,
                  p50Days: 61,
                  p90Days: 100,
                  quarterStart: "2026-04-01",
                  processingMonths: 3,
                },
                {
                  filedMonth: "2026-06-01",
                  approvedReports: 116,
                  p10Days: 20,
                  p50Days: 37,
                  p90Days: 80,
                  quarterStart: null,
                  processingMonths: null,
                },
              ],
            },
            {
              caseType: "opt",
              premium: false,
              points: [
                {
                  filedMonth: "2026-06-01",
                  approvedReports: 40,
                  p10Days: 20,
                  p50Days: 50,
                  p90Days: 80,
                  quarterStart: null,
                  processingMonths: null,
                },
              ],
            },
          ],
        },
      })
    }
    if (path.endsWith("/h1b-talk"))
      return route.fulfill({
        json: {
          from: "2021-10-30",
          through: "2026-11-04",
          months: [
            {
              month: "2021-10-01",
              h1bPosts: 2,
              h1bComments: 1,
              lotteryPosts: null,
              lotteryComments: null,
              lcaCases: null,
              lcaCertified: null,
            },
            {
              month: "2026-06-01",
              h1bPosts: 10,
              h1bComments: 3,
              lotteryPosts: 2,
              lotteryComments: 1,
              lcaCases: 1164,
              lcaCertified: 900,
            },
            {
              month: "2026-11-01",
              h1bPosts: 4,
              h1bComments: 1,
              lotteryPosts: null,
              lotteryComments: null,
              lcaCases: null,
              lcaCertified: null,
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
    if (path.endsWith("/I-129"))
      return route.fulfill({
        json: {
          name: "Work petition",
          redditOfficialDescription: "Petition for a Nonimmigrant Worker",
          official: [
            {
              id: "work",
              label: "Work petition",
              description: "Petition for a Nonimmigrant Worker",
              points: [],
            },
          ],
        },
      })
    if (path.endsWith("/I-765"))
      return route.fulfill({
        json: {
          name: "Work permit",
          redditOfficialDescription: description,
          official: [
            { id: "all", label: "All other cases", description, points: [] },
            { id: "other", label: "Other", description: "Other", points: [] },
          ],
        },
      })
    return route.fulfill({ json: { name: "Work permit", official: [] } })
  })
  await page.goto("/trends?journey=students&form=I-765")
  await expect(
    page.getByRole("button", { name: "Reddit", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page.getByRole("button", { name: "All · 2 months" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Regular · 1 month" })
  ).toBeVisible()
  await expect(
    page.getByText(
      /Filed May 2026 · 80 approved reports · approved so far; recent months skew short/
    )
  ).toBeVisible()
  await expect(page.getByText("2 months", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Regular · 1 month" }).click()
  await expect(
    page.getByText(/Filed Jun 2026 · 40 approved reports · approved so far/)
  ).toBeVisible()
  await page.getByRole("button", { name: "All · 2 months" }).click()
  expect(redditRequests).toBe(1)
  await page
    .getByRole("group", { name: "Case category" })
    .getByRole("button", { name: "Other", exact: true })
    .click()
  await expect(
    page.getByRole("group", { name: "Reported wait source" })
  ).toHaveCount(0)
  expect(redditRequests).toBe(1)
  await expect(
    page.getByText(/OPT and STEM OPT timelines from Reddit/)
  ).toHaveCount(0)
  await page.getByRole("button", { name: "All other cases" }).click()
  await expect(
    page.getByText(/Filed May 2026 · 80 approved reports/)
  ).toBeVisible()
  expect(redditRequests).toBe(1)
  await page.getByRole("button", { name: "VisaJourney" }).click()
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
  await page.goBack()
  await page
    .getByRole("group", { name: "Journey" })
    .getByRole("button", { name: "Workers", exact: true })
    .click()
  await page
    .getByRole("group", { name: "Form" })
    .getByRole("button", { name: /I-129/ })
    .click()
  await expect(
    page.getByRole("button", { name: "Reddit", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await page.goto("/trends?form=I-485")
  await expect(
    page.getByRole("button", { name: "Came on F-1", exact: true })
  ).toBeVisible()
  await expect(page.getByText("not OPT data")).toHaveCount(0)
  await page.goto("/trends?journey=workers&form=I-765&insight=h1b-talk")
  await expect(
    page.getByText(
      "Latest LCA month (Jun 2026) may be incomplete; later months not yet published."
    )
  ).toBeVisible()
  await page.getByText("Monthly data", { exact: true }).click()
  await expect(
    page.getByRole("region", { name: "H-1B activity and LCA monthly data" })
  ).toHaveAttribute("tabindex", "0")
  await expect(
    page.getByRole("cell", { name: "Oct 2021 · partial" })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "Nov 2026 · partial" })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "Jun 2026 · May be incomplete" })
  ).toBeVisible()
})

test("insight edge states and employer year retain focus", async ({ page }) => {
  let releaseYear: (() => void) | undefined
  await page.route("**/api/x/uscis/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith("/forms"))
      return route.fulfill({
        json: {
          forms: [
            { form: "I-765", name: "Work permit", featured: true },
            { form: "I-129", name: "Work petition", featured: true },
          ],
        },
      })
    if (path.endsWith("/community"))
      return route.fulfill({ json: { series: [] } })
    if (path.endsWith("/visa-221g"))
      return route.fulfill({
        json: {
          status: "ready",
          historical: true,
          source: "Immihelp",
          from: null,
          to: null,
          excluded: 0,
          groups: [
            {
              office: "All consulates",
              included: 100,
              decisions: 40,
              censored: 60,
              medianDays: null,
              p90Days: null,
              curve: [
                { day: 0, waiting: 1, low: null, high: null, atRisk: 100 },
                { day: 0, waiting: 0.99, low: 0.9, high: 1, atRisk: 99 },
              ],
            },
          ],
        },
      })
    if (path.endsWith("/h1b-employers")) {
      if (url.searchParams.has("year"))
        await new Promise<void>((resolve) => {
          releaseYear = resolve
        })
      if (url.searchParams.get("year") === "2024")
        return route.fulfill({ status: 400, json: { message: "Bad request" } })
      return route.fulfill({
        json: url.searchParams.has("year")
          ? { years: [], year: null, employers: [] }
          : {
              years: [2025, 2024, 2023],
              year: 2025,
              employers: [
                {
                  name: "Employer",
                  initialApprovals: 10,
                  initialDenials: 1,
                  continuingApprovals: 2,
                },
              ],
            },
      })
    }
    if (path.endsWith("/h1b-pay")) return route.fulfill({ json: { years: [] } })
    if (path.endsWith("/student-posts"))
      return route.fulfill({
        json: {
          from: null,
          to: null,
          weeks: [],
          topics: {
            sevis: { posts: 0 },
            cpt: { posts: 0 },
            policy: { posts: 0 },
          },
        },
      })
    return route.fulfill({ json: { name: "Work permit", official: [] } })
  })
  await page.goto("/trends?journey=students&form=I-765&insight=visa-221g")
  await expect(page.getByText("Most are still waiting")).toBeVisible()
  await expect(
    page.getByText("Older self-reports · not a current forecast")
  ).toBeVisible()
  await page.getByText("Data", { exact: true }).click()
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "0", exact: true }) })
  ).toHaveCount(2)
  await page.goto("/trends?journey=students&form=I-765&insight=h1b-pay")
  await expect(page.getByRole("button", { name: "Case wait" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await page.getByRole("button", { name: "What students post about" }).click()
  await expect(page.getByText("Nothing to show yet.")).toBeVisible()
  await page.goto("/trends?journey=workers&form=I-129&insight=h1b-pay")
  await expect(page.getByText("Nothing to show yet.")).toBeVisible()
  await page
    .getByRole("button", { name: "Employers with H‑1B approvals" })
    .click()
  const select = page.getByLabel("Year")
  await select.focus()
  await select.selectOption("2024")
  await expect(select).toBeFocused()
  await expect(page.getByRole("status")).toHaveText("Loading employers…")
  await expect.poll(() => !!releaseYear).toBe(true)
  releaseYear!()
  await expect(page.getByText("Insights unavailable.")).toBeVisible()
  await expect(select).toBeFocused()
  releaseYear = undefined
  await select.selectOption("2023")
  await expect.poll(() => !!releaseYear).toBe(true)
  releaseYear!()
  await expect(page.getByText("Nothing to show yet.")).toBeVisible()
})

test("Reddit failures remain local and retryable", async ({ page }) => {
  test.setTimeout(90000)
  const counts: Record<string, number> = {}
  const desc = "Application for Employment Authorization (All Other)"
  await page.route("**/api/x/uscis/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (
      path.endsWith("/reddit") ||
      path.endsWith("/h1b-talk") ||
      path.endsWith("/discussion")
    ) {
      counts[path] = (counts[path] ?? 0) + 1
      return route.fulfill({ status: 503, json: { message: "Unavailable" } })
    }
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
    if (path.endsWith("/community"))
      return route.fulfill({ json: { series: [] } })
    if (path.endsWith("/bulletin"))
      return route.fulfill({
        json: {
          categories: [{ code: "EB2" }],
          series: [
            {
              country: "ALL",
              label: "All",
              points: [
                { month: "2025-01-01", cutoff: "2020-01-01", status: "date" },
              ],
            },
          ],
        },
      })
    return route.fulfill({
      json: {
        name: "Work permit",
        redditOfficialDescription: desc,
        official: [
          {
            id: "all",
            label: "All other cases",
            description: desc,
            points: [],
          },
          { id: "other", label: "Other", description: "Other", points: [] },
        ],
      },
    })
  })
  await page.goto("/trends?journey=students&form=I-765")
  await expect(page.getByText("Reddit data unavailable.")).toBeVisible({
    timeout: 20000,
  })
  let before = counts["/api/x/uscis/forms/I-765/reddit"]
  await page.getByRole("button", { name: "Try again" }).click()
  await expect
    .poll(() => counts["/api/x/uscis/forms/I-765/reddit"])
    .toBeGreaterThan(before)
  await page
    .getByRole("group", { name: "Case category" })
    .getByRole("button", { name: "Other", exact: true })
    .click()
  await expect(
    page.getByRole("group", { name: "Reported wait source" })
  ).toHaveCount(0)
  await page.goto("/trends?journey=workers&form=I-765&insight=h1b-talk")
  await expect(page.getByText("Reddit data unavailable.")).toBeVisible({
    timeout: 20000,
  })
  before = counts["/api/x/uscis/insights/h1b-talk"]
  await page.getByRole("button", { name: "Try again" }).click()
  await expect
    .poll(() => counts["/api/x/uscis/insights/h1b-talk"])
    .toBeGreaterThan(before)
  await page.goto("/bulletin?category=EB2")
  await page.getByText("More context").click()
  await page.getByText("Reddit discussion", { exact: true }).click()
  await expect(page.getByText("Reddit data unavailable.")).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByRole("heading", { name: "Jan 1, 2020" })).toBeVisible()
  before = counts["/api/x/uscis/bulletin/discussion"]
  await page.getByRole("button", { name: "Try again" }).click()
  await expect
    .poll(() => counts["/api/x/uscis/bulletin/discussion"])
    .toBeGreaterThan(before)
})

test("bulletin selection and historical status", async ({ page }) => {
  let requests = 0
  await page.route("**/api/x/uscis/bulletin?**", async (route) => {
    requests++
    const category = new URL(route.request().url()).searchParams.get("category")
    const point =
      category === "EB5-RC"
        ? { month: "2022-04-01", cutoff: null, status: "current" }
        : { month: "2025-01-01", cutoff: "2020-01-01", status: "date" }
    await route.fulfill({
      json: {
        categories: [{ code: "F2A" }, { code: "EB2" }, { code: "EB5-RC" }],
        series: [
          { country: "ALL", points: [point] },
          {
            country: "INDIA",
            points: [
              category === "F2A"
                ? { month: "2024-03-01", cutoff: "2019-01-01", status: "date" }
                : point,
            ],
          },
        ],
      },
    })
  })
  await page.goto("/bulletin")
  await expect(page.getByRole("heading", { name: "Jan 1, 2020" })).toHaveCount(
    0
  )
  await page.getByRole("button", { name: "Family", exact: true }).click()
  await page
    .getByRole("button", { name: /Spouses and unmarried children/ })
    .click()
  await expect(page.getByRole("heading", { name: "Jan 1, 2020" })).toBeVisible()
  const before = requests
  await page.getByRole("button", { name: "India", exact: true }).click()
  expect(requests).toBe(before)
  await expect(
    page.getByText("Historical · last bulletin Mar 2024")
  ).toBeVisible()
  await page.getByRole("button", { name: "Family", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Jan 1, 2019" })).toBeVisible()
  await page.getByRole("button", { name: "Family", exact: true }).focus()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: /Change/ })).toBeFocused()
  await page.goto("/bulletin?category=EB5-RC")
  await expect(
    page.getByRole("heading", { name: "Current", exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Historical · last bulletin Apr 2022")
  ).toBeVisible()
  await expect(page.getByText(/no dated cutoff to plot/i)).toBeVisible()
  await page.goto("/bulletin?category=UNKNOWN")
  await expect(page.getByRole("alert")).toContainText("not in the catalog")
  await expect(page.getByRole("heading", { name: "Jan 1, 2020" })).toHaveCount(
    0
  )
})

test("my case keeps a same-year filing change local", async ({ page }) => {
  let requests = 0
  let catalogUnavailable = false
  let releaseCatalog: () => void = () => {}
  const catalogReady = new Promise<void>((resolve) => {
    releaseCatalog = resolve
  })
  await page.route("**/api/x/uscis/case**", async (route) => {
    requests++
    if (catalogUnavailable)
      return route.fulfill({ status: 503, json: { message: "Unavailable" } })
    if (requests === 1) await catalogReady
    const selectedForm = new URL(route.request().url()).searchParams.get("form")
    if (selectedForm === "I-404")
      return route.fulfill({ status: 404, json: { message: "Not found" } })
    await route.fulfill({
      json: {
        forms: [
          { form: "I-485", name: "Green card application", featured: true },
          { form: "I-130", name: "Family petition", featured: true },
          { form: "I-765", name: "Work permit (EAD)", featured: true },
          { form: "I-999", name: "Other application", featured: false },
          { form: "I-888", name: "Special application", featured: true },
          { form: "I-777", name: "Unknown timeline", featured: true },
        ],
        form: "I-485",
        categoryLabel:
          selectedForm === "I-765" ? "Adjustment of status" : "Family",
        official:
          selectedForm === "I-999"
            ? {
                medianMonths: null,
                period: null,
                reason: "unavailable",
              }
            : {
                medianMonths: 12,
                period: "2026-04-01",
                previousMedianMonths: 10,
                previousPeriod: "2026-01-01",
                trend: "up",
                asOfDate: "2026-05-01",
              },
        trend: [],
        community:
          selectedForm === "I-999" ||
          selectedForm === "I-888" ||
          selectedForm === "I-777"
            ? { filingYear: 2025, p25Days: null, p75Days: null }
            : selectedForm === "I-130"
              ? {
                  filingYear: 2025,
                  p25Days: null,
                  p75Days: null,
                  reason: "insufficient",
                }
              : {
                  filingYear: 2025,
                  p25Days: 130,
                  p75Days: selectedForm === "I-765" ? 131 : 253,
                  asOfDate: "2026-05-01",
                },
        summary: {
          eligibleReports:
            selectedForm === "I-999"
              ? 0
              : selectedForm === "I-777"
                ? null
                : 31416,
          years: [2024, 2025],
        },
        freshness: [],
      },
    })
  })
  await page.goto("/")
  expect(requests).toBe(0)
  await page.getByRole("link", { name: "Check my case timeline" }).click()
  await expect(page.getByText("Loading forms…")).toBeVisible()
  await expect(page.getByText("Forms are unavailable right now.")).toHaveCount(
    0
  )
  releaseCatalog()
  await expect(
    page.getByRole("link", { name: "Community", exact: true }).last()
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Special application/ })
  ).toBeVisible()
  await page.getByRole("button", { name: /Green card application/ }).click()
  await expect(
    page.getByText("People who filed in 2025: about 4.3–8.3 months")
  ).toBeVisible()
  await expect(page).not.toHaveURL(/view=case/)
  await page.getByRole("link", { name: "gongu" }).click()
  await expect(
    page.getByRole("link", { name: "Check my case timeline" })
  ).toHaveAttribute("href", /form=I-485/)
  await page.getByRole("link", { name: "Check my case timeline" }).click()
  await expect(
    page.getByText("People who filed in 2025: about 4.3–8.3 months")
  ).toBeVisible()
  await expect(
    page.getByText(
      "Family-based · USCIS data, Apr–Jun 2026 (as of May 1, 2026)"
    )
  ).toBeVisible()
  await page.getByRole("button", { name: /Change form/ }).click()
  await page.getByRole("button", { name: /Work permit \(EAD\)/ }).click()
  await expect(
    page.getByText(/While a green card is pending · USCIS data/)
  ).toBeVisible()
  await expect(
    page.getByText("People who filed in 2025: about 4.3 months")
  ).toBeVisible()
  await page.getByRole("button", { name: /Change form/ }).click()
  await page.getByRole("button", { name: /Family petition/ }).click()
  await expect(
    page.getByText("Not enough reports yet to show a range.")
  ).toBeVisible()
  await expect(page.getByText("VisaJourney", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: /Change form/ }).click()
  await page.getByRole("button", { name: /Browse all other forms/ }).click()
  await page.getByLabel("Search by name or form number").fill("green card")
  await expect(
    page.getByRole("button", { name: /Green card application/ }).last()
  ).toBeVisible()
  await page.getByLabel("Search by name or form number").fill("I-999")
  await page.getByRole("button", { name: /Other application/ }).click()
  await expect(
    page.getByText("No community reports for this form yet.")
  ).toBeVisible()
  await expect(
    page.getByText("USCIS hasn't published a typical wait for this form.")
  ).toBeVisible()
  await expect(page.getByText(/Period unavailable/)).toHaveCount(0)
  await expect(page.getByText("VisaJourney", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: /Change form/ }).click()
  const selectedOther = page.getByRole("button", {
    name: /Other application.*Selected/,
  })
  await expect(selectedOther).toBeFocused()
  await expect(selectedOther).toBeInViewport()
  await page.getByRole("button", { name: /Unknown timeline/ }).click()
  await expect(
    page.getByText("Community timelines aren't available for this form yet.")
  ).toBeVisible()
  await expect(
    page.getByText("No community reports for this form yet.")
  ).toHaveCount(0)
  await page.getByRole("button", { name: /Change form/ }).click()
  await page.getByRole("button", { name: /Special application/ }).click()
  await expect(
    page.getByText("No community reports yet from people who filed in 2025.")
  ).toBeVisible()
  await page.getByRole("button", { name: /Change form/ }).click()
  await page.getByRole("button", { name: /Green card application/ }).click()
  await expect(page.getByRole("button", { name: /Change form/ })).toBeFocused()
  await page.getByLabel("When did you file? (optional)").focus()
  await page.keyboard.type("01012025")
  await expect(page.getByLabel("When did you file? (optional)")).toHaveValue(
    "2025-01-01"
  )
  await expect(
    page.getByText("Around Jan 1, 2026", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText(
      "If your wait is like others who filed in 2025: May 11 – Sep 11, 2025",
      {
        exact: true,
      }
    )
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Check the visa bulletin" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Your estimated decision" })
  ).toBeVisible()
  await expect(
    page.getByText("Estimates, not USCIS commitments.")
  ).toBeVisible()
  const before = requests
  await page.getByLabel("When did you file? (optional)").fill("2025-01-02")
  await expect(
    page.getByText(
      "If your wait is like others who filed in 2025: May 12 – Sep 12, 2025",
      {
        exact: true,
      }
    )
  ).toBeVisible()
  expect(requests).toBe(before)
  await page.getByText("More data").click()
  await page.getByRole("link", { name: "Trends for I-485" }).click()
  await expect(page).toHaveURL(/\/trends/)
  await page
    .getByRole("link", { name: "Community", exact: true })
    .first()
    .click()
  await page.getByRole("link", { name: "My case", exact: true }).click()
  await expect(page).toHaveURL(/form=I-485/)
  await page.goto("/?form=I-404")
  await expect(page.getByRole("alert")).toContainText("not in the catalog")
  await expect(
    page.getByRole("group", { name: "Choose your case" })
  ).toHaveCount(0)
  await expect(page.getByText("Loading forms…")).toHaveCount(0)
  await expect(page.getByText("Forms are unavailable right now.")).toHaveCount(
    0
  )
  await page.getByRole("button", { name: "Choose a form" }).click()
  await expect(
    page.getByRole("button", { name: /Green card application/ })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "My case", exact: true })
  ).toHaveAttribute("href", /form=I-485/)
  catalogUnavailable = true
  await page.clock.install()
  const beforeError = requests
  await page.goto("/?view=case")
  for (let attempt = 1; attempt <= 3; attempt++) {
    await expect
      .poll(() => requests)
      .toBeGreaterThanOrEqual(beforeError + attempt)
    await page.clock.runFor(5000)
  }
  await expect(page.getByText("Forms are unavailable right now.")).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByRole("alert")).toHaveCount(0)
  catalogUnavailable = false
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(
    page.getByRole("button", { name: /Green card application/ })
  ).toBeVisible()
})
