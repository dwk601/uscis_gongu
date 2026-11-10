import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { lazy, Suspense, useEffect, useRef, type CSSProperties } from "react"
import { formHue } from "@/lib/palette"
import { SiteHeader } from "@/components/site-header"

const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      }))
    )
  : () => null
const QueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      }))
    )
  : () => null

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  { component: RootLayout }
)

function RootLayout() {
  const { location, matches } = useRouterState({
    select: (state) => ({ location: state.location, matches: state.matches }),
  })
  const leafSearch = matches.at(-1)?.search as
    { form?: string; view?: string } | undefined
  const pathname = matches.at(-1)?.pathname ?? location.pathname
  const screen =
    pathname === "/"
      ? leafSearch?.form || leafSearch?.view === "case"
        ? "/case"
        : "/landing"
      : pathname
  const previousScreen = useRef(screen)
  useEffect(() => {
    if (previousScreen.current === screen) return
    previousScreen.current = screen
    const frame = requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>("main")
      const target = main?.querySelector<HTMLElement>("h1") ?? main
      if (target) {
        target.tabIndex = -1
        target.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [screen])
  const form =
    typeof location.search.form === "string" ? location.search.form : "I-485"
  return (
    <div
      className={
        location.pathname === "/trends" ? "app-shell trend-shell" : "app-shell"
      }
      style={{ "--page-hue": formHue(form) } as CSSProperties}
    >
      <SiteHeader />
      <Outlet />
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <RouterDevtools position="bottom-right" />
          <QueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      )}
    </div>
  )
}
