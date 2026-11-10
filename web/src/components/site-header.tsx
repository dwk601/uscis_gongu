import { Link, useRouterState } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { AccountAction } from "./account-action"
import { useTheme } from "./theme-provider"

export function SiteHeader() {
  const { theme, setTheme } = useTheme()
  const location = useRouterState({ select: (state) => state.location })
  const params = new URLSearchParams(location.searchStr)
  const currentForm = location.pathname === "/" ? params.get("form") : null
  const caseActive =
    location.pathname === "/" &&
    (!!currentForm || params.get("view") === "case")
  const form =
    currentForm || sessionStorage.getItem("gongu-last-case-form") || ""
  return (
    <header className="site-header">
      <Link to="/" search={{ form: "" }} className="brand">
        <img src="/gongu.svg" alt="" />
        gongu
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
        <AccountAction />
      </div>
    </header>
  )
}
