import { Link } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useAuth } from "@/lib/auth"
import { pb } from "@/lib/pb"
import "./community.css"

export function AccountAction() {
  const user = useAuth()
  const client = useQueryClient()
  useEffect(() => {
    let id = pb.authStore.record?.id
    return pb.authStore.onChange((_token, record) => {
      if (id !== record?.id) {
        id = record?.id
        client.clear()
      }
    })
  }, [client])
  if (!user)
    return (
      <Link className="primary account-signin" to="/login" search={{}}>
        Sign in
      </Link>
    )
  return (
    <details className="account-menu">
      <summary aria-label="Account menu">
        {(user.name || user.email || "M").slice(0, 1).toUpperCase()}
      </summary>
      <div>
        <Link to="/settings">Settings</Link>
        <button type="button" onClick={() => pb.authStore.clear()}>
          Sign out
        </button>
      </div>
    </details>
  )
}
