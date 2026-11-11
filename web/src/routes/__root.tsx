import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { lazy, Suspense, useEffect, useRef, type CSSProperties } from "react"
import { formHue, formInk } from "@/lib/palette"
import { cn } from "@/lib/utils"
import { SiteHeader } from "@/components/site-header"
import { AgentWidget } from "@/components/agent-widget"

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
  const showAgent = location.pathname !== "/login"
  return (
    <div
      className={cn(
        "app-shell",
        location.pathname === "/trends" && "trend-shell",
        showAgent && "has-agent"
      )}
      style={
        {
          "--page-hue": formHue(form),
          "--page-ink": formInk(form),
        } as CSSProperties
      }
    >
      <SiteHeader />
      <Outlet />
      {showAgent && <AgentWidget />}
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <RouterDevtools position="top-right" />
          <QueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      )}
    </div>
  )
}
