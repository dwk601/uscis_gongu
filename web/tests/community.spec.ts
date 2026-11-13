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
  const sorts: string[] = []
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
    const params = new URL(route.request().url()).searchParams
    filter = params.get("filter") || ""
    sorts.push(params.get("sort") || "")
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
  const sorting = page.getByRole("group", { name: "Sort and filter posts" })
  const newest = sorting.getByRole("button", { name: "New", exact: true })
  const top = sorting.getByRole("button", { name: "Top", exact: true })
  const initialURL = page.url()
  await newest.focus()
  await page.keyboard.press("ArrowRight")
  await expect(top).toBeFocused()
  await expect(newest).toHaveAttribute("aria-pressed", "true")
  expect(page.url()).toBe(initialURL)
  expect(sorts).toEqual(["-created"])
  await page.keyboard.press("Enter")
  await expect(top).toHaveAttribute("aria-pressed", "true")
  await expect(page).toHaveURL(/sort=top/)
  await expect(page).toHaveURL(/form=I-485/)
  await expect.poll(() => sorts).toEqual(["-created", "-votes,-created"])
  const historyLength = await page.evaluate("history.length")
  await top.click()
  await expect(top).toHaveAttribute("aria-pressed", "true")
  expect(await page.evaluate("history.length")).toBe(historyLength)
  expect(sorts).toEqual(["-created", "-votes,-created"])
  await page.goBack()
  await expect(newest).toHaveAttribute("aria-pressed", "true")
  await expect(page).toHaveURL(/form=I-485/)
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

test("account choices preserve error reset, form submission, and member activation", async ({
  page,
}) => {
  const token = `e30.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`
  const admin = {
    id: "admin0000000001",
    collectionId: "users",
    collectionName: "users",
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
  }
  const members = [
    { id: "member000000001", name: "Alice", created: "2025-01-01 00:00:00Z" },
    { id: "member000000002", name: "Bob", created: "2025-01-02 00:00:00Z" },
  ]
  const signIns: unknown[] = []
  const creations: unknown[] = []
  const names: unknown[] = []
  const contentRequests: string[] = []
  const unexpected: string[] = []
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path.endsWith("/users/auth-with-password")) {
      signIns.push(request.postDataJSON())
      return signIns.length === 1
        ? route.fulfill({
            status: 400,
            json: { message: "Invalid credentials" },
          })
        : route.fulfill({ json: { token, record: admin } })
    }
    if (path.endsWith("/users/records")) {
      if (request.method() === "POST") {
        creations.push(request.postDataJSON())
        return creations.length === 1
          ? route.fulfill({
              status: 400,
              json: { data: { email: { code: "validation_not_unique" } } },
            })
          : route.fulfill({ json: admin })
      }
      return route.fulfill({ json: { page: 1, totalPages: 1, items: members } })
    }
    if (path.endsWith(`/users/records/${admin.id}`)) {
      names.push(request.postDataJSON())
      return route.fulfill({ json: { ...admin, name: "New name" } })
    }
    if (
      path.endsWith("/post_feed/records") ||
      path.endsWith("/comment_feed/records")
    ) {
      contentRequests.push(url.searchParams.get("filter") || "")
      return route.fulfill({ json: { page: 1, totalPages: 1, items: [] } })
    }
    unexpected.push(path)
    return route.abort()
  })
  await page.goto("/login?redirect=%2Fsettings")
  const mode = page.getByRole("group", { name: "Account mode" })
  const signIn = mode.getByRole("button", { name: "Sign in", exact: true })
  const create = mode.getByRole("button", {
    name: "Create account",
    exact: true,
  })
  await expect(mode.locator('button[tabindex="0"]')).toHaveCount(1)
  await page.getByLabel("Email", { exact: true }).fill(admin.email)
  await page.getByLabel("Password", { exact: true }).fill("password123")
  await page.getByLabel("Password", { exact: true }).press("Enter")
  await expect(page.getByRole("alert")).toHaveText(
    "Email or password is incorrect. Please try again."
  )
  await signIn.click()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(signIn).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowRight")
  await expect(create).toBeFocused()
  await expect(signIn).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByLabel("Display name")).toHaveCount(0)
  await page.keyboard.press("Space")
  await expect(create).toHaveAttribute("aria-pressed", "true")
  await page.getByLabel("Display name").fill("New member")
  await page.getByLabel("Password", { exact: true }).press("Enter")
  await expect(page.getByRole("alert")).toHaveText(
    "An account with this email already exists. Sign in instead."
  )
  await create.click()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(create).toHaveAttribute("aria-pressed", "true")
  await page.getByLabel("Password", { exact: true }).press("Enter")
  await expect(page).toHaveURL(/\/settings$/)
  expect(signIns).toEqual([
    { identity: admin.email, password: "password123" },
    { identity: admin.email, password: "password123" },
  ])
  expect(creations).toEqual([
    {
      email: admin.email,
      password: "password123",
      passwordConfirm: "password123",
      name: "New member",
    },
    {
      email: admin.email,
      password: "password123",
      passwordConfirm: "password123",
      name: "New member",
    },
  ])
  await page.getByLabel("Name", { exact: true }).fill("New name")
  await page.getByLabel("Name", { exact: true }).press("Enter")
  await expect(page.getByRole("status")).toHaveText("Display name saved.")
  expect(names).toEqual([{ name: "New name" }])
  const appearance = page.getByRole("group", { name: "Appearance" })
  const light = appearance.getByRole("button", { name: "Light", exact: true })
  const dark = appearance.getByRole("button", { name: "Dark", exact: true })
  await expect(appearance.locator('button[tabindex="0"]')).toHaveCount(1)
  await light.focus()
  await page.keyboard.press("ArrowRight")
  await expect(dark).toBeFocused()
  await expect(light).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveClass("light")
  await page.keyboard.press("Space")
  await expect(dark).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveClass("dark")
  await dark.click()
  await expect(dark).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowLeft")
  await expect(light).toBeFocused()
  await expect(dark).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Enter")
  await expect(light).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveClass("light")
  const memberGroup = page.getByRole("group", { name: "Members", exact: true })
  const alice = memberGroup.getByRole("button", { name: "Alice", exact: true })
  const bob = memberGroup.getByRole("button", { name: "Bob", exact: true })
  await expect(memberGroup.locator('button[tabindex="0"]')).toHaveCount(1)
  await alice.focus()
  await page.keyboard.press("ArrowDown")
  await expect(bob).toBeFocused()
  await expect(alice).toHaveAttribute("aria-pressed", "false")
  await expect(bob).toHaveAttribute("aria-pressed", "false")
  expect(contentRequests).toEqual([])
  await page.keyboard.press("Enter")
  await expect(
    page.getByRole("heading", { name: "Content by Bob" })
  ).toBeFocused()
  await expect(bob).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(() => contentRequests)
    .toEqual(['author = "member000000002"', 'author = "member000000002"'])
  await bob.click()
  await expect(bob).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowUp")
  await expect(alice).toBeFocused()
  await expect(bob).toHaveAttribute("aria-pressed", "true")
  expect(contentRequests).toHaveLength(2)
  await page.keyboard.press("Space")
  await expect(
    page.getByRole("heading", { name: "Content by Alice" })
  ).toBeFocused()
  await expect(alice).toHaveAttribute("aria-pressed", "true")
  await expect.poll(() => contentRequests.length).toBe(4)
  expect(unexpected).toEqual([])
})

test("upvotes stay optimistic, block pending presses, and roll back errors", async ({
  page,
}) => {
  const userId = "member000000001"
  const postId = "post00000000001"
  const voteId = "vote00000000001"
  let voted = false
  let fail = false
  let release: (() => void) | undefined
  const mutations: { method: string; body: unknown }[] = []
  const unexpected: string[] = []
  await page.addInitScript((id) => {
    const token = `e30.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`
    localStorage.setItem(
      "pocketbase_auth",
      JSON.stringify({
        token,
        record: { id, collectionId: "users", collectionName: "users" },
      })
    )
  }, userId)
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith("/users/auth-refresh"))
      return route.fulfill({ status: 503, json: { message: "Unavailable" } })
    if (path === "/api/x/uscis/case")
      return route.fulfill({ json: { forms: [], summary: { years: [] } } })
    if (path.endsWith("/post_feed/records"))
      return route.fulfill({
        json: {
          page: 1,
          perPage: 20,
          items: [
            {
              id: postId,
              title: "A timeline",
              body: "Hello",
              form: "",
              author_name: "A",
              created: "2025-01-01 00:00:00Z",
              votes: voted ? 1 : 0,
              comments: 0,
            },
          ],
        },
      })
    if (path.endsWith("/votes/records") && request.method() === "GET")
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          items: voted ? [{ id: voteId, post: postId, user: userId }] : [],
        },
      })
    if (
      path.endsWith("/votes/records") ||
      path.endsWith(`/votes/records/${voteId}`)
    ) {
      mutations.push({
        method: request.method(),
        body: request.postData() ? request.postDataJSON() : null,
      })
      await new Promise<void>((resolve) => {
        release = resolve
      })
      release = undefined
      if (fail)
        return route.fulfill({ status: 500, json: { message: "Vote failed" } })
      voted = request.method() === "POST"
      return voted
        ? route.fulfill({ json: { id: voteId } })
        : route.fulfill({ status: 204 })
    }
    unexpected.push(path)
    return route.abort()
  })
  await page.goto("/community")
  const vote = page.locator(".social-actions button[aria-pressed]")
  await expect(vote).toHaveAccessibleName("Upvote, 0 votes")
  await expect(vote).toBeEnabled()
  await vote.focus()
  await page.keyboard.press("Space")
  await expect(vote).toHaveAttribute("aria-pressed", "true")
  await expect(vote).toHaveAccessibleName("Remove upvote, 1 vote")
  await expect(vote).toBeDisabled()
  await vote.evaluate((button: { click: () => void }) => button.click())
  await expect.poll(() => !!release).toBe(true)
  expect(mutations).toEqual([
    { method: "POST", body: { post: postId, user: userId } },
  ])
  release!()
  await expect(vote).toBeEnabled()
  await expect(vote).toHaveAttribute("aria-pressed", "true")
  fail = true
  await vote.click()
  await expect(vote).toHaveAttribute("aria-pressed", "false")
  await expect(vote).toHaveAccessibleName("Upvote, 0 votes")
  await expect(vote).toBeDisabled()
  await expect.poll(() => !!release).toBe(true)
  release!()
  await expect(page.getByRole("alert")).toHaveText("Vote failed")
  await expect(vote).toBeEnabled()
  await expect(vote).toHaveAttribute("aria-pressed", "true")
  await expect(vote).toHaveAccessibleName("Remove upvote, 1 vote")
  fail = false
  await vote.focus()
  await page.keyboard.press("Enter")
  await expect(vote).toHaveAttribute("aria-pressed", "false")
  await expect.poll(() => !!release).toBe(true)
  release!()
  await expect(vote).toBeEnabled()
  await expect(vote).toHaveAccessibleName("Upvote, 0 votes")
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(mutations).toEqual([
    { method: "POST", body: { post: postId, user: userId } },
    { method: "DELETE", body: null },
    { method: "DELETE", body: null },
  ])
  expect(unexpected).toEqual([])
})
