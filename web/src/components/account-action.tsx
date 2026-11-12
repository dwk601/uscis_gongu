import { Link, useRouterState } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, type RefObject } from "react"
import { useAuth } from "@/lib/auth"
import { pb } from "@/lib/pb"
import "./community.css"

export function AccountAction({
  menu,
  onOpen,
}: {
  menu: RefObject<HTMLDetailsElement | null>
  onOpen: () => void
}) {
  const user = useAuth()
  const client = useQueryClient()
  const location = useRouterState({ select: (state) => state.location.href })
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node))
        menu.current?.removeAttribute("open")
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.removeAttribute("open")
        menu.current.querySelector("summary")?.focus()
      }
    }
    document.addEventListener("pointerdown", closeOutside)
    document.addEventListener("keydown", closeEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOutside)
      document.removeEventListener("keydown", closeEscape)
    }
  }, [menu])
  useEffect(() => {
    let id = pb.authStore.record?.id
    return pb.authStore.onChange((_token, record) => {
      if (id !== record?.id) {
        id = record?.id
        client.removeQueries({ queryKey: ["votes"] })
        void client.invalidateQueries({ queryKey: ["post_feed"] })
        void client.invalidateQueries({ queryKey: ["comment_feed"] })
      }
    })
  }, [client])
  if (!user)
    return (
      <Link
        className="primary account-signin"
        to="/login"
        search={{ redirect: location }}
      >
        Sign in
      </Link>
    )
  return (
    <details
      className="account-menu"
      ref={menu}
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen()
      }}
    >
      <summary aria-label="Account menu">
        {(user.name || user.email || "M").slice(0, 1).toUpperCase()}
      </summary>
      <div>
        <Link
          to="/settings"
          onClick={() => menu.current?.removeAttribute("open")}
        >
          Settings
        </Link>
        <button type="button" onClick={() => pb.authStore.clear()}>
          Sign out
        </button>
      </div>
    </details>
  )
}
