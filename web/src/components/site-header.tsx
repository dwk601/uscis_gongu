import { Link } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { AccountAction } from "./account-action"
import { useTheme } from "./theme-provider"

const navigation = [
  { label: "Trends", to: "/trends", search: { form: "I-485" } },
  {
    label: "Bulletin",
    to: "/bulletin",
    search: { category: "EB2", chart: "final_action", country: "ALL" },
  },
  { label: "Community", to: "/community", search: { sort: "new", form: "" } },
] as const

export function SiteHeader() {
  const { theme, setTheme } = useTheme()
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <img src="/gongu.svg" alt="" />
        gongu
      </Link>
      <nav aria-label="Main navigation">
        {navigation.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            search={item.search}
            activeProps={{ className: "active" }}
          >
            {item.label}
          </Link>
        ))}
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
