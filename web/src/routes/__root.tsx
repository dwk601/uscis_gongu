import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { formHue, formInk } from "@/lib/palette"
import { cn } from "@/lib/utils"
import { authReady, safeRedirect } from "@/lib/auth"
import { pb } from "@/lib/pb"
import { profileComplete } from "@/lib/profile"
import { SiteHeader } from "@/components/site-header"
import { AgentLauncher } from "@/components/agent-launcher"

const loadAgentWidget = () =>
  import("@/components/agent-widget").then((m) => ({ default: m.AgentWidget }))
const AgentWidget = lazy(loadAgentWidget)
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
  {
    beforeLoad: async ({ location }) => {
      if (!pb.authStore.isValid) return
      const pathname = location.pathname.replace(/\/+$/, "") || "/"
      if (["/welcome", "/login", "/settings"].includes(pathname)) return
      if (profileComplete(pb.authStore.record)) return
      await authReady
      if (!pb.authStore.isValid || profileComplete(pb.authStore.record)) return
      throw redirect({
        to: "/welcome",
        search: { redirect: safeRedirect(location.href) },
      })
    },
    component: RootLayout,
  }
)

function RootLayout() {
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentLoaded, setAgentLoaded] = useState(false)
  const [agentPanel, setAgentPanel] = useState<HTMLDivElement | null>(null)
  const accountMenu = useRef<HTMLDetailsElement>(null)
  const loadAgent = () =>
    loadAgentWidget().then(
      () => setAgentLoaded(true),
      () => setAgentOpen(false)
    )
  const { location, matches } = useRouterState({
    select: (state) => ({ location: state.location, matches: state.matches }),
  })
  const leafSearch = matches.at(-1)?.search as
    { form?: string; view?: string } | undefined
  const pathname =
    (matches.at(-1)?.pathname ?? location.pathname).replace(/\/+$/, "") || "/"
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
  const showAgent = !["/login", "/welcome"].includes(pathname)
  if (!showAgent && agentOpen) setAgentOpen(false)
  return (
    <div
      className={cn(
        "app-shell",
        location.pathname === "/trends" && "trend-shell"
      )}
      style={
        {
          "--page-hue": formHue(form),
          "--page-ink": formInk(form),
        } as CSSProperties
      }
    >
      <SiteHeader
        launcher={
          showAgent && (
            <AgentLauncher
              panel={agentPanel}
              open={agentOpen}
              onIntent={loadAgent}
              onOpenChange={(next) => {
                if (next) {
                  loadAgent()
                  accountMenu.current?.removeAttribute("open")
                }
                setAgentOpen(next)
              }}
            />
          )
        }
        accountMenu={accountMenu}
        onAccountOpen={() => setAgentOpen(false)}
      />
      <Outlet />
      {agentLoaded && (
        <Suspense fallback={null}>
          <AgentWidget
            panel={agentPanel}
            panelRef={setAgentPanel}
            open={showAgent && agentOpen}
            onOpenChange={setAgentOpen}
          />
        </Suspense>
      )}
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <RouterDevtools position="top-right" />
          <QueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      )}
    </div>
  )
}
