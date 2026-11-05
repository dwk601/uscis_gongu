import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { useTheme } from "@/components/theme-provider"
import { authReady, useAuth, mutationErrorMessage } from "@/lib/auth"
import { pb } from "@/lib/pb"

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    await authReady
    if (!pb.authStore.isValid)
      throw redirect({ to: "/login", search: { redirect: "/settings" } })
  },
  component: Settings,
})
function Settings() {
  const user = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function action(fn: () => Promise<void>) {
    setError("")
    setMessage("")
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(await mutationErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  function name(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    void action(async () => {
      if (!user) return
      const record = await pb
        .collection("users")
        .update(user.id, { name: data.get("name") })
      pb.authStore.save(pb.authStore.token, record)
      await client.invalidateQueries({ queryKey: ["post_feed"] })
      await client.invalidateQueries({ queryKey: ["comment_feed"] })
      setMessage("Display name saved.")
    })
  }
  function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    void action(async () => {
      if (!user) return
      const next = String(data.get("password"))
      if (next !== data.get("confirm")) {
        setError("New passwords do not match.")
        return
      }
      await pb.collection("users").update(user.id, {
        oldPassword: data.get("oldPassword"),
        password: next,
        passwordConfirm: next,
      })
      await pb.collection("users").authWithPassword(user.email, next)
      form.reset()
      setMessage("Password changed.")
    })
  }
  if (!user)
    return (
      <main className="workspace social">
        {error && (
          <p className="social-error" role="alert">
            {error}
          </p>
        )}
        <p>Sign in to manage your settings.</p>
        <Link
          className="primary"
          to="/login"
          search={{ redirect: "/settings" }}
        >
          Sign in
        </Link>
      </main>
    )
  return (
    <main className="workspace social social-narrow">
      <h1>Settings</h1>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <section className="social-section">
        <h2>Display name</h2>
        <form className="social-form" onSubmit={name}>
          <label>
            Name
            <input name="name" maxLength={50} defaultValue={user.name} />
          </label>
          <button className="primary" disabled={busy}>
            Save
          </button>
        </form>
      </section>
      <section className="social-section">
        <h2>Appearance</h2>
        <div className="controls">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              className="chip"
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </section>
      <section className="social-section">
        <h2>Change password</h2>
        <form className="social-form" onSubmit={password}>
          <label>
            Current password
            <input
              name="oldPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirm"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
          <button className="primary" disabled={busy}>
            Change password
          </button>
        </form>
      </section>
      <section className="social-section">
        <button
          className="chip"
          onClick={() => {
            pb.authStore.clear()
            void navigate({
              to: "/community",
              search: { sort: "new", form: "" },
            })
          }}
        >
          Sign out
        </button>
      </section>
      <section className="social-section">
        <h2>Delete account</h2>
        <p>
          Deleting your account also deletes your posts, comments, and votes.
        </p>
        <button
          className="chip danger"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Delete your account? Your posts, comments and votes will be deleted."
              )
            )
              void action(async () => {
                await pb.collection("users").delete(user.id)
                pb.authStore.clear()
                client.clear()
                await navigate({
                  to: "/community",
                  search: { sort: "new", form: "" },
                })
              })
          }}
        >
          Delete account
        </button>
      </section>
    </main>
  )
}
