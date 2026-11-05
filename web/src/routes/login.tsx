import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { pb } from "@/lib/pb"
import { errorMessage } from "@/lib/auth"

function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  try {
    const decoded = decodeURIComponent(value)
    if (
      [...decoded].some(
        (char) =>
          char.charCodeAt(0) < 32 ||
          (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159) ||
          char === "\\"
      )
    )
      return undefined
    const path = value.split(/[?#]/, 1)[0]
    if (
      !/^(?:\/|\/trends|\/bulletin|\/settings|\/community\/?|\/community\/[a-z0-9]{15})$/.test(
        path
      )
    )
      return undefined
    return value
  } catch {
    return undefined
  }
}

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
      await navigate({ href: redirect || "/community" })
    } catch (err) {
      if (created) setCreate(false)
      const status = (err as { status?: number }).status
      const message =
        !create && status === 400
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
      <h1>{create ? "Create account" : "Sign in"}</h1>
      <div className="social-card">
        <div className="controls">
          <button
            className="chip"
            aria-pressed={!create}
            onClick={() => {
              setCreate(false)
              setError("")
            }}
          >
            Sign in
          </button>
          <button
            className="chip"
            aria-pressed={create}
            onClick={() => {
              setCreate(true)
              setError("")
            }}
          >
            Create account
          </button>
        </div>
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
