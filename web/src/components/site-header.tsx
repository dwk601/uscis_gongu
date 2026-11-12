import { Link, useRouterState } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { useLayoutEffect, useRef, type RefObject } from "react"
import { getSessionItem } from "@/lib/session-storage"
import { AccountAction } from "./account-action"
import { useTheme } from "./theme-provider"

export function SiteHeader({
  onLauncherSlot,
  accountMenu,
  onAccountOpen,
}: {
  onLauncherSlot: (node: HTMLSpanElement | null) => void
  accountMenu: RefObject<HTMLDetailsElement | null>
  onAccountOpen: () => void
}) {
  const header = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = header.current!
    const sticky = window.matchMedia("(min-height: 521px)")
    const update = () =>
      document.documentElement.style.setProperty(
        "--header-h",
        sticky.matches ? `${element.getBoundingClientRect().height}px` : "0px"
      )
    const observer = new ResizeObserver(update)
    observer.observe(element)
    sticky.addEventListener("change", update)
    update()
    return () => {
      observer.disconnect()
      sticky.removeEventListener("change", update)
      document.documentElement.style.removeProperty("--header-h")
    }
  }, [])
  const { theme, setTheme } = useTheme()
  const location = useRouterState({ select: (state) => state.location })
  const params = new URLSearchParams(location.searchStr)
  const currentForm = location.pathname === "/" ? params.get("form") : null
  const caseActive =
    location.pathname === "/" &&
    (!!currentForm || params.get("view") === "case")
  const form = currentForm || getSessionItem("gongu-last-case-form") || ""
  return (
    <header ref={header} className="site-header">
      <Link to="/" search={{ form: "" }} className="brand" aria-label="gongu">
        <img src="/gongu.svg" alt="" />
        <span>gongu</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link
          to="/"
          search={form ? { form } : { form: "", view: "case" }}
          className={caseActive ? "active" : undefined}
        >
          My case
        </Link>
        <Link to="/bulletin" search={{}} activeProps={{ className: "active" }}>
          Visa bulletin
        </Link>
        <Link
          to="/community"
          search={{ sort: "new", form: "" }}
          activeProps={{ className: "active" }}
          activeOptions={{ includeSearch: false }}
        >
          Community
        </Link>
      </nav>
      <div className="header-actions">
        <button
          className="theme-toggle"
          type="button"
          aria-label={
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          }
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <AccountAction menu={accountMenu} onOpen={onAccountOpen} />
        <span ref={onLauncherSlot} />
      </div>
    </header>
  )
}
