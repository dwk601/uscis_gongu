import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { bulletinQuery } from "@/lib/api"
import { categoryHue } from "@/lib/palette"
import { categoryLabel, countryLabel } from "@/lib/labels"

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
const cutoffDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
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
    exact: p.cutoff ? cutoffDate(p.cutoff) : undefined,
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
            Approval cutoff · Final action dates
          </button>
          <button
            className="chip"
            aria-pressed={search.chart === "dates_for_filing"}
            onClick={() => update({ chart: "dates_for_filing" })}
          >
            Filing cutoff · Dates for filing
          </button>
        </div>
      </div>
      <p>
        These are priority-date cutoffs, not approval estimates; check{" "}
        <a
          className="bulletin-link"
          href="https://www.uscis.gov/visabulletininfo"
        >
          USCIS’s filing chart
        </a>{" "}
        before applying for a green card in the U.S.
      </p>
      {bulletin.isLoading ? (
        <div className="skeleton" aria-label="Loading bulletin" />
      ) : bulletin.isError ? (
        <p className="error">
          Bulletin unavailable.{" "}
          <button onClick={() => void bulletin.refetch()}>Try again</button>
        </p>
      ) : (
        <>
          <label>
            Category
            <select
              className="field"
              aria-label="Category"
              value={search.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              {["Family", "Work & special immigrants", "Investors"].map(
                (group) => (
                  <optgroup key={group} label={group}>
                    {bulletin.data?.categories
                      .filter((c) =>
                        group === "Family"
                          ? c.code.startsWith("F")
                          : group === "Investors"
                            ? c.code.startsWith("EB5")
                            : !c.code.startsWith("F") &&
                              !c.code.startsWith("EB5")
                      )
                      .map((c) => (
                        <option key={c.code} value={c.code}>
                          {categoryLabel(c.code)}
                        </option>
                      ))}
                  </optgroup>
                )
              )}
            </select>
          </label>
          <p>{categoryLabel(search.category)}</p>
          <div
            className="controls bulletin-rail"
            role="group"
            aria-label="Country"
            tabIndex={0}
          >
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
              <h2>
                {current?.status === "current"
                  ? "Current"
                  : current?.status === "unavailable"
                    ? "Unavailable"
                    : current?.cutoff
                      ? cutoffDate(current.cutoff)
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
                {current?.month ? `Bulletin ${month(current.month)} · ` : ""}
                {categoryLabel(search.category)} ·{" "}
                {series ? countryLabel(series.country) : ""}
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
