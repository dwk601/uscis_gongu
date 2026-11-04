import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { bulletinQuery } from "@/lib/api"
import { categoryHue } from "@/lib/palette"

const DataChart = lazy(() => import("@/components/data-chart"))
type Search = { category: string; chart: string; country: string }
export const Route = createFileRoute("/bulletin")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    category:
      typeof search.category === "string" &&
      /^[A-Z0-9-]+$/.test(search.category)
        ? search.category
        : "EB2",
    chart: search.chart === "dates_for_filing" ? search.chart : "final_action",
    country:
      typeof search.country === "string" && /^[A-Z0-9 -]+$/.test(search.country)
        ? search.country
        : "ALL",
  }),
  component: BulletinPage,
})
const month = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
const categoryLabels: Record<string, string> = {
  EB1: "EB-1",
  EB2: "EB-2",
  EB3: "EB-3",
  "EB3-OW": "EB-3 Other workers",
  EB4: "EB-4",
  "EB4-RELIGIOUS": "EB-4 Religious",
  "EB5-NON-RC": "EB-5 Non-regional center",
  "EB5-RC": "EB-5 Regional center",
  "EB5-SET-ASIDE-HIGH-UNEMPLOYMENT": "EB-5 High unemployment",
  "EB5-SET-ASIDE-INFRASTRUCTURE": "EB-5 Infrastructure",
  "EB5-SET-ASIDE-RURAL": "EB-5 Rural",
  "EB5-UNRESERVED": "EB-5 Unreserved",
  "EB5-UNRESERVED-RC": "EB-5 Unreserved regional center",
}
const countryLabels: Record<string, string> = {
  ALL: "All countries",
  CHINA: "China",
  INDIA: "India",
  MEXICO: "Mexico",
  PHILIPPINES: "Philippines",
  "EL SALVADOR GUATEMALA HONDURAS": "El Salvador/Guatemala/Honduras",
}
const categoryLabel = (code: string) => categoryLabels[code] ?? code
const countryLabel = (code: string) => countryLabels[code] ?? code

function BulletinPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const update = (next: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })
  const bulletin = useQuery(bulletinQuery(search.category, search.chart))
  const series =
    bulletin.data?.series.find((s) => s.country === search.country) ??
    bulletin.data?.series[0]
  const points =
    series?.points
      .filter((p) => p.month)
      .slice()
      .sort((a, b) => a.month!.localeCompare(b.month!)) ?? []
  const current = points.at(-1)
  const previousDate = current?.month
    ? new Date(`${current.month}T00:00:00Z`)
    : undefined
  previousDate?.setUTCFullYear(previousDate.getUTCFullYear() - 1)
  const previous = points.find(
    (p) => p.month === previousDate?.toISOString().slice(0, 10)
  )
  const delta =
    current?.cutoff &&
    previous?.cutoff &&
    current.status === "date" &&
    previous.status === "date"
      ? Math.round(
          (Date.parse(current.cutoff) - Date.parse(previous.cutoff)) /
            86400000 /
            30.44
        )
      : null
  const rows = points.map((p) => ({
    x: Date.parse(`${p.month}T00:00:00Z`),
    label: month(p.month!),
    status: p.status,
    value:
      p.status === "date" && p.cutoff
        ? new Date(`${p.cutoff}T00:00:00Z`).getUTCFullYear() +
          new Date(`${p.cutoff}T00:00:00Z`).getUTCMonth() / 12
        : null,
  }))
  return (
    <main className="workspace">
      <div className="bulletin-heading">
        <h1>Visa bulletin</h1>
        <div className="controls">
          <button
            className="chip"
            aria-pressed={search.chart === "final_action"}
            onClick={() => update({ chart: "final_action" })}
          >
            Final action
          </button>
          <button
            className="chip"
            aria-pressed={search.chart === "dates_for_filing"}
            onClick={() => update({ chart: "dates_for_filing" })}
          >
            Dates for filing
          </button>
        </div>
      </div>
      {bulletin.isLoading ? (
        <div className="skeleton" aria-label="Loading bulletin" />
      ) : bulletin.isError ? (
        <p className="error">
          Bulletin unavailable.{" "}
          <button onClick={() => void bulletin.refetch()}>Try again</button>
        </p>
      ) : (
        <>
          {["Family", "Employment"].map((group) => {
            const categories =
              bulletin.data?.categories.filter((c) =>
                c.group.toLowerCase().includes(group.toLowerCase())
              ) ?? []
            return categories.length ? (
              <div className="controls" key={group}>
                <span className="muted">{group}</span>
                {categories
                  .filter((c) => !c.code.startsWith("EB5"))
                  .map((c) => (
                    <button
                      key={c.code}
                      className="chip"
                      aria-pressed={search.category === c.code}
                      onClick={() => update({ category: c.code })}
                    >
                      {categoryLabel(c.code)}
                    </button>
                  ))}
                {categories.some((c) => c.code.startsWith("EB5")) && (
                  <select
                    className="field"
                    aria-label="EB-5 category"
                    value={
                      search.category.startsWith("EB5") ? search.category : ""
                    }
                    onChange={(e) => {
                      if (e.target.value) update({ category: e.target.value })
                    }}
                  >
                    <option value="">EB-5 categories</option>
                    {categories
                      .filter((c) => c.code.startsWith("EB5"))
                      .map((c) => (
                        <option key={c.code} value={c.code}>
                          {categoryLabel(c.code)}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            ) : null
          })}
          <div className="controls" aria-label="Country">
            {bulletin.data?.series.map((s) => (
              <button
                key={s.country}
                className="chip"
                aria-pressed={series?.country === s.country}
                onClick={() => update({ country: s.country })}
              >
                {countryLabel(s.country)}
              </button>
            ))}
          </div>
          <div className="workspace-grid">
            <section
              className="panel bulletin-card"
              style={{ background: categoryHue(search.category) }}
            >
              <small>
                {categoryLabel(search.category)} ·{" "}
                {series ? countryLabel(series.country) : ""}
              </small>
              <h2>
                {current?.status === "current"
                  ? "Current"
                  : current?.status === "unavailable"
                    ? "Unavailable"
                    : current?.cutoff
                      ? month(current.cutoff)
                      : "No cutoff available"}
              </h2>
              <p>
                {delta == null
                  ? "12-month change unavailable"
                  : delta === 0
                    ? "No change vs. 12 months ago"
                    : `${Math.abs(delta)} months ${delta > 0 ? "forward" : "back"} vs. 12 months ago`}
              </p>
              <small>
                {current?.month ? `Bulletin ${month(current.month)}` : ""}
              </small>
            </section>
            <Suspense fallback={<div className="skeleton" />}>
              <DataChart
                title="Cutoff date over time"
                rows={rows}
                hue={categoryHue(search.category)}
                calendar
                dateValues
                extras={bulletin.data?.series
                  .filter((s) => s.country !== series?.country)
                  .map((s) =>
                    s.points
                      .filter((p) => p.month)
                      .map((p) => ({
                        x: Date.parse(`${p.month}T00:00:00Z`),
                        label: month(p.month!),
                        value:
                          p.status === "date" && p.cutoff
                            ? new Date(
                                `${p.cutoff}T00:00:00Z`
                              ).getUTCFullYear() +
                              new Date(`${p.cutoff}T00:00:00Z`).getUTCMonth() /
                                12
                            : null,
                      }))
                  )}
              />
            </Suspense>
          </div>
        </>
      )}
    </main>
  )
}
