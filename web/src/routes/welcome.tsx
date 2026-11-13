import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { ProfileForm } from "@/components/profile-form"
import { authReady, safeRedirect, useAuth } from "@/lib/auth"
import { pb } from "@/lib/pb"
import { profileComplete } from "@/lib/profile"

export const Route = createFileRoute("/welcome")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: async ({ search }) => {
    await authReady
    if (!pb.authStore.isValid)
      throw redirect({ to: "/login", search: { redirect: search.redirect } })
    if (profileComplete(pb.authStore.record))
      throw redirect({ href: search.redirect || "/community" })
  },
  component: Welcome,
})

function Welcome() {
  const user = useAuth()
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  useEffect(() => {
    if (!user)
      void navigate({ to: "/login", search: { redirect }, replace: true })
  }, [user, navigate, redirect])

  return (
    <main className="workspace social social-narrow">
      <h1>About you</h1>
      <p>
        A few answers before you continue. Every question has an N/A option.
      </p>
      {user && (
        <ProfileForm
          key={user.id}
          user={user}
          submitLabel="Save and continue"
          onSaved={() =>
            navigate({ href: redirect || "/community", replace: true })
          }
        />
      )}
    </main>
  )
}
