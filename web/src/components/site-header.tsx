import { Link, useRouterState } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { AccountAction } from "./account-action"
import { useTheme } from "./theme-provider"

export function SiteHeader() {
  const { theme, setTheme } = useTheme()
  const location = useRouterState({ select: (state) => state.location })
  const currentForm =
    location.pathname === "/"
      ? new URLSearchParams(location.searchStr).get("form")
      : null
  const form =
    currentForm || sessionStorage.getItem("gongu-last-case-form") || ""
  return (
    <header className="site-header">
      <Link to="/" search={{ form }} className="brand">
        <img src="/gongu.svg" alt="" />
        gongu
      </Link>
      <nav aria-label="Main navigation">
        <Link
          to="/"
          search={{ form }}
          activeProps={{ className: "active" }}
          activeOptions={{ includeSearch: false, exact: true }}
        >
          My case
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
