import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { bulletinQuery, movement } from "@/lib/api"
import { categoryHue } from "@/lib/palette"
import { categoryLabel, categoryLabels, countryLabel } from "@/lib/labels"

const DataChart = lazy(() => import("@/components/data-chart"))
const RedditDiscussionPanel = lazy(() =>
  import("@/components/reddit-insights").then((m) => ({
    default: m.RedditDiscussionPanel,
  }))
)
const olderInvestors = new Set(["EB5-NON-RC", "EB5-RC", "EB5-UNRESERVED-RC"])
const groups = ["Family", "Work & special immigrants", "Investors"] as const
function groupFor(code: string) {
  return code.startsWith("F")
    ? groups[0]
    : code.startsWith("EB5")
      ? groups[2]
      : groups[1]
}
type Search = {
  category?: string
  chart?: string
  country?: string
  group?: string
}
export const Route = createFileRoute("/bulletin")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    category:
      typeof search.category === "string" &&
      /^[A-Z0-9-]+$/.test(search.category)
        ? search.category
        : undefined,
    chart: search.chart === "dates_for_filing" ? search.chart : "final_action",
    country:
      typeof search.country === "string" && /^[A-Z0-9 -]+$/.test(search.country)
        ? search.country
        : "ALL",
    group:
      typeof search.group === "string" &&
      groups.includes(search.group as (typeof groups)[number])
        ? search.group
        : undefined,
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
function CategoryName({ code }: { code: string }) {
  const [description, categoryCode, ...qualifiers] =
    categoryLabel(code).split(" · ")
  return (
    <span className="bulletin-category-name">
      <span>
        {description}
        {qualifiers.length > 0 && ` · ${qualifiers.join(" · ")}`}
      </span>
      {categoryCode && <small>{categoryCode}</small>}
    </span>
  )
}
function BulletinPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const update = (next: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })
  const category = search.category
  const chart = search.chart ?? "final_action"
  const country = search.country ?? "ALL"
  const known = !!category && Object.hasOwn(categoryLabels, category)
  const bulletin = useQuery(bulletinQuery(known ? category : "EB2", chart))
  const group = known ? groupFor(category) : search.group
  const [expanded, setExpanded] = useState(false)
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const summaryRef = useRef<HTMLButtonElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const focusSummary = useRef(false)
  useEffect(() => {
    if (!expanded && focusSummary.current && summaryRef.current) {
      summaryRef.current.focus()
      focusSummary.current = false
    } else if (expanded) selectedRef.current?.focus()
  }, [expanded, category])
  const data = known ? bulletin.data : undefined
  const series = data?.series.find((s) => s.country === country)
  const points =
    series?.points
      .filter((p) => p.month)
      .slice()
      .sort((a, b) => a.month!.localeCompare(b.month!)) ?? []
  const current = points.at(-1)
  const latest = data?.series
    .flatMap((s) =>
      s.points.map((p) => p.month).filter((m): m is string => !!m)
    )
    .sort()
    .at(-1)
  const historical =
    !!current?.month &&
    ((!!latest && current.month < latest) || olderInvestors.has(category!))
  const monthlyChange = movement(points, current?.month ?? null)
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
  const savedForm = sessionStorage.getItem("gongu-last-case-form") || ""
  return (
    <main
      className="workspace bulletin-page"
      onKeyDown={(event) => {
        if (event.key === "Escape" && known && expanded) {
          event.preventDefault()
          focusSummary.current = true
          setExpanded(false)
        }
      }}
    >
      <div className="bulletin-heading">
        <h1>Visa bulletin</h1>
        {known && (
          <div className="controls" role="group" aria-label="Bulletin chart">
            <button
              className="chip"
              aria-pressed={chart === "final_action"}
              onClick={() => update({ chart: "final_action" })}
            >
              Approval cutoff
            </button>
            <button
              className="chip"
              aria-pressed={chart === "dates_for_filing"}
              onClick={() => update({ chart: "dates_for_filing" })}
            >
              Filing cutoff
            </button>
          </div>
        )}
      </div>
      {!group && <h2 className="bulletin-prompt">Which group fits you?</h2>}
      <div className="controls" role="group" aria-label="Bulletin group">
        {groups.map((item) => (
          <button
            type="button"
            className="chip"
            key={item}
            aria-pressed={group === item}
            onClick={() => {
              setExpanded(true)
              if (item !== group) update({ group: item, category: undefined })
            }}
          >
            {item}
          </button>
        ))}
      </div>
      {group === groups[0] && (!known || expanded) && (
        <p>
          Spouse, parent, or unmarried child under 21 of a U.S. citizen? No
          bulletin wait.{" "}
          <Link
            className="bulletin-link"
            to="/"
            search={
              savedForm ? { form: savedForm } : { form: "", view: "case" }
            }
          >
            Check my case timeline
          </Link>
        </p>
      )}
      {category && !known && (
        <p role="alert">
          This category is not in the catalog. Choose a group and category to
          continue.
        </p>
      )}
      {known && !expanded && (
        <button
          ref={summaryRef}
          className="form-summary"
          onClick={() => setExpanded(true)}
        >
          <CategoryName code={category} />
          <span>Change</span>
        </button>
      )}
      {group && (!known || expanded) && (
        <section className="bulletin-categories">
          <h2>Choose a category</h2>
          {bulletin.isLoading ? (
            <p role="status">Loading categories…</p>
          ) : bulletin.isError ? (
            <p role="alert">
              Categories unavailable.{" "}
              <button onClick={() => void bulletin.refetch()}>Try again</button>
            </p>
          ) : (
            <div className="bulletin-category-list">
              {bulletin.data?.categories
                .filter((c) => groupFor(c.code) === group)
                .sort(
                  (a, b) =>
                    Number(olderInvestors.has(a.code)) -
                    Number(olderInvestors.has(b.code))
                )
                .map((c) => (
                  <button
                    className="form-summary"
                    ref={c.code === category ? selectedRef : undefined}
                    aria-pressed={c.code === category}
                    key={c.code}
                    onClick={() => {
                      focusSummary.current = true
                      setExpanded(false)
                      update({ category: c.code, group: undefined })
                    }}
                  >
                    <CategoryName code={c.code} />
                  </button>
                ))}
            </div>
          )}
        </section>
      )}
      {known && (
        <section className="bulletin-country">
          <h2>Country of birth</h2>
          {bulletin.isLoading ? (
            <div
              className="bulletin-skeletons"
              role="status"
              aria-label="Loading countries"
            >
              <span />
              <span />
              <span />
            </div>
          ) : bulletin.isError ? (
            <p role="alert">
              Bulletin unavailable.{" "}
              <button onClick={() => void bulletin.refetch()}>Try again</button>
            </p>
          ) : (
            <>
              <div
                className="controls bulletin-rail"
                role="group"
                aria-label="Country of birth"
              >
                {data?.series.map((s) => (
                  <button
                    key={s.country}
                    className="chip"
                    aria-pressed={country === s.country}
                    onClick={() => update({ country: s.country })}
                  >
                    {countryLabel(s.country)}
                  </button>
                ))}
              </div>
              {!series && (
                <p role="alert">
                  {countryLabel(country)} is not available for this category.{" "}
                  <button
                    className="chip"
                    onClick={() => update({ country: "ALL" })}
                  >
                    Use All other countries
                  </button>
                </p>
              )}
            </>
          )}
        </section>
      )}
      {series && category && (
        <>
          <div className="workspace-grid">
            <section
              className="panel bulletin-card"
              style={{ background: categoryHue(category) }}
            >
              {historical && current?.month && (
                <p className="bulletin-historical">
                  Historical · last bulletin {month(current.month)}
                </p>
              )}
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
                {monthlyChange == null
                  ? "Monthly change unavailable"
                  : monthlyChange === 0
                    ? "No change since last month"
                    : `Moved ${Math.abs(monthlyChange).toLocaleString()} days ${monthlyChange > 0 ? "forward" : "back"} since last month`}
              </p>
              <p>
                {current?.month ? `Bulletin ${month(current.month)} · ` : ""}
                {categoryLabel(category)} · {countryLabel(series.country)} ·{" "}
                {chart === "final_action" ? "Approval cutoff" : "Filing cutoff"}
              </p>
            </section>
            <Suspense fallback={<div className="skeleton" />}>
              <DataChart
                title="Cutoff date over time"
                rows={rows}
                hue={categoryHue(category)}
                calendar
                dateValues
              />
            </Suspense>
          </div>
          <details className="bulletin-details">
            <summary>More context</summary>
            <p>
              {delta == null
                ? "12-month change unavailable"
                : delta === 0
                  ? "No change vs. 12 months ago"
                  : `${Math.abs(delta)} months ${delta > 0 ? "forward" : "back"} vs. 12 months ago`}
            </p>
            <p>
              Approval cutoff is officially called Final action dates; filing
              cutoff is Dates for filing. Cases with a priority date before the
              cutoff can move ahead; these are not approval estimates. Check{" "}
              <a
                className="bulletin-link"
                href="https://www.uscis.gov/visabulletininfo"
              >
                USCIS’s filing chart
              </a>{" "}
              before applying for a green card in the U.S.
            </p>
            <p>
              Family-preference F1 is not student F-1. Immediate relatives of
              U.S. citizens are not subject to these cutoffs.
            </p>
            {group === groups[0] ? (
              <p>
                Reddit family posts mostly concern spouse/fiancé cases and are
                not a useful comparison with family-preference cutoffs.
              </p>
            ) : (
              <details
                onToggle={(e) => setDiscussionOpen(e.currentTarget.open)}
              >
                <summary>Reddit discussion</summary>
                {discussionOpen && (
                  <Suspense fallback={<div className="skeleton" />}>
                    <RedditDiscussionPanel
                      points={points}
                      hue={categoryHue(category)}
                    />
                  </Suspense>
                )}
              </details>
            )}
          </details>
        </>
      )}
    </main>
  )
}
