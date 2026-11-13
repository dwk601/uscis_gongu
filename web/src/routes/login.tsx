import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle"
import { pb } from "@/lib/pb"
import { errorMessage, safeRedirect } from "@/lib/auth"

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(s.redirect),
  }),
  component: Login,
})
function Login() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  const [create, setCreate] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const data = new FormData(e.currentTarget)
    const email = String(data.get("email"))
    const password = String(data.get("password"))
    let created = false
    try {
      if (create)
        await pb
          .collection("users")
          .create({
            email,
            password,
            passwordConfirm: password,
            name: data.get("name"),
          })
          .then(() => {
            created = true
          })
      await pb.collection("users").authWithPassword(email, password)
      if (create) await navigate({ to: "/welcome", search: { redirect } })
      else await navigate({ href: redirect || "/community" })
    } catch (err) {
      if (created) setCreate(false)
      const status = (err as { status?: number }).status
      const emailError = (
        err as { response?: { data?: { email?: { code?: string } } } }
      ).response?.data?.email?.code
      const message =
        create && !created && emailError === "validation_not_unique"
          ? "An account with this email already exists. Sign in instead."
          : !create && status === 400
            ? "Email or password is incorrect. Please try again."
            : errorMessage(err)
      setError(
        created ? `Account created. Sign in to continue. ${message}` : message
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="workspace social social-narrow">
      <h1>Welcome to gongu</h1>
      <div className="social-card">
        <ToggleGroup
          className="controls"
          aria-label="Account mode"
          value={[create ? "create" : "sign-in"]}
          deselectable={false}
          onValueChange={([mode]) => setCreate(mode === "create")}
        >
          <Toggle className="chip" value="sign-in" onClick={() => setError("")}>
            Sign in
          </Toggle>
          <Toggle className="chip" value="create" onClick={() => setError("")}>
            Create account
          </Toggle>
        </ToggleGroup>
        <form className="social-form" onSubmit={submit}>
          {create && (
            <label>
              Display name
              <input name="name" maxLength={50} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={create ? 8 : undefined}
              autoComplete={create ? "new-password" : "current-password"}
            />
          </label>
          {error && (
            <p className="social-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Please wait…" : create ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  )
}
