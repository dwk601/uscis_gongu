import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { lazy, Suspense, type CSSProperties } from "react"
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
  const location = useRouterState({ select: (state) => state.location })
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
