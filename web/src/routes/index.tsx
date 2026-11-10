import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { caseQuery, type CaseResponse } from "@/lib/case"
import type { OfficialPoint } from "@/lib/api"
import { estimateDate, formatMonths, quarterLabel } from "@/lib/estimate"
import { formHue, formInk } from "@/lib/palette"
import { FormPicker } from "@/components/form-picker"

export const Route = createFileRoute("/")({
  validateSearch: (
    s: Record<string, unknown>
  ): { form: string; filed?: string; view?: "case" } => ({
    form:
      typeof s.form === "string" && /^[A-Z0-9-]{1,12}$/.test(s.form)
        ? s.form
        : "",
    filed: validFiled(s.filed) ? (s.filed as string) : undefined,
    view: s.view === "case" ? "case" : undefined,
  }),
  component: Home,
})
function validFiled(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number(value.slice(0, 4)) < 1900
  )
    return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}
function dateLabel(date: Date) {
  return date
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })
    .replaceAll(" ", "\u00a0")
}
function dateRange(start: Date, end: Date) {
  if (start.getTime() === end.getTime()) return dateLabel(start)
  const first =
    start.getUTCFullYear() === end.getUTCFullYear()
      ? start
          .toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
          .replaceAll(" ", "\u00a0")
      : dateLabel(start)
  return `${first} – ${dateLabel(end)}`
}
function humanDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : dateLabel(date)
}
function categoryLabel(label: string, form: string) {
  const normalized = label.toLowerCase()
  if (normalized === "family") return "Family-based"
  if (normalized === "employment") return "Employment-based"
  if (normalized === "adjustment of status" && form === "I-765")
    return "While a green card is pending"
  return label
}
function reportedRange(low: number, high: number) {
  if (low < 2 * 30.44) {
    if (low === high) return `${low} days`
    return `${low} days – ${high < 2 * 30.44 ? `${high} days` : `${formatMonths(high / 30.44)} months`}`
  }
  const first = formatMonths(low / 30.44)
  const last = formatMonths(high / 30.44)
  return `${first === last ? first : `${first}–${last}`} months`
}
function addDays(filed: string, days: number) {
  return new Date(new Date(`${filed}T00:00:00Z`).getTime() + days * 86400000)
}
function recentValues(points: OfficialPoint[]) {
  const sorted = points
    .filter((p) => p.quarterStart)
    .slice()
    .sort((a, b) => a.quarterStart!.localeCompare(b.quarterStart!))
    .slice(-12)
  const values: (number | null)[] = []
  let previous: Date | undefined
  for (const point of sorted) {
    const current = new Date(`${point.quarterStart}T00:00:00Z`)
    if (previous) {
      const next = new Date(previous)
      next.setUTCMonth(next.getUTCMonth() + 3)
      while (next < current) {
        values.push(null)
        next.setUTCMonth(next.getUTCMonth() + 3)
      }
    }
    values.push(point.processingMonths)
    previous = current
  }
  return values
}

function MiniTrend({ values }: { values: (number | null)[] }) {
  const valid = values.filter(
    (value): value is number => value != null && Number.isFinite(value)
  )
  if (valid.length < 2) return null
  const min = Math.min(...valid),
    span = Math.max(...valid) - min || 1
  const segments: string[] = []
  let path = ""
  values.forEach((value, index) => {
    if (value == null) {
      if (path) segments.push(path)
      path = ""
      return
    }
    const point = `${(index / Math.max(values.length - 1, 1)) * 240},${70 - ((value - min) / span) * 60}`
    path += `${path ? " L" : "M"}${point}`
  })
  if (path) segments.push(path)
  return (
    <svg
      viewBox="-4 -4 248 88"
      role="img"
      aria-label={`USCIS median processing time in recent quarters, ranging from ${formatMonths(min)} to ${formatMonths(Math.max(...valid))} months`}
    >
      {values.map((value, index) =>
        value == null ? null : (
          <circle
            key={`point-${index}`}
            cx={(index / Math.max(values.length - 1, 1)) * 240}
            cy={70 - ((value - min) / span) * 60}
            r="2.5"
            fill="currentColor"
          />
        )
      )}
      {segments.map((segment, index) => (
        <path
          key={index}
          d={segment}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      ))}
    </svg>
  )
}

function periodLabel(period: string | null | undefined) {
  if (!period) return null
  const date = new Date(`${period}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const month = date.getUTCMonth()
  return quarterLabel(
    date.getUTCFullYear() + (month >= 9 ? 1 : 0),
    Math.floor(((month + 3) % 12) / 3) + 1
  )
}

function Home() {
  const search = Route.useSearch()
  if (!search.form && search.view !== "case") return <Landing />
  return <CasePage />
}

function Landing() {
  const form = sessionStorage.getItem("gongu-last-case-form") || ""
  return (
    <main className="workspace landing-page">
      <h1>Find your next step.</h1>
      <p>Explore case timelines or see the latest visa bulletin.</p>
      <div className="landing-choices">
        <Link
          to="/"
          search={form ? { form } : { form: "", view: "case" }}
          aria-label="Check my case timeline"
          aria-describedby="case-description"
        >
          <strong>Check my case timeline</strong>
          <span id="case-description">
            See typical waits and timelines from people like you.
          </span>
        </Link>
        <Link
          to="/bulletin"
          search={{}}
          aria-label="Check the visa bulletin"
          aria-describedby="bulletin-description"
        >
          <strong>Check the visa bulletin</strong>
          <span id="bulletin-description">
            Explore cutoff dates for your category and country of birth.
          </span>
        </Link>
      </div>
    </main>
  )
}

function CasePage() {
  const search = Route.useSearch()
  const [now] = useState(() => Date.now())
  const navigate = useNavigate({ from: "/" })
  const year = search.filed ? Number(search.filed.slice(0, 4)) : undefined
  const result = useQuery({
    ...caseQuery(search.form || "I-485", year),
    placeholderData: keepPreviousData,
  })
  useEffect(() => {
    if (search.form && result.isSuccess && !result.isPlaceholderData)
      sessionStorage.setItem("gongu-last-case-form", search.form)
    else if (
      (result.error as { status?: number })?.status === 404 &&
      sessionStorage.getItem("gongu-last-case-form") === search.form
    )
      sessionStorage.removeItem("gongu-last-case-form")
  }, [search.form, result.isSuccess, result.isPlaceholderData, result.error])
  const client = useQueryClient()
  const forms =
    result.data?.forms ??
    client
      .getQueriesData<CaseResponse>({ queryKey: ["uscis", "case"] })
      .find(([, value]) => value?.forms)?.[1]?.forms
  const notFound =
    result.isError && (result.error as { status?: number })?.status === 404
  const data =
    !search.form || result.isPlaceholderData ? undefined : result.data
  const filedInput = useRef<HTMLInputElement>(null)
  const committed = useRef(search.filed)
  useEffect(() => {
    if (committed.current !== search.filed) {
      if (filedInput.current) filedInput.current.value = search.filed ?? ""
      committed.current = search.filed
    }
  }, [search.filed])
  const official = data?.official
  const community = data?.community
  const estimate =
    search.filed && official?.medianMonths != null
      ? estimateDate(search.filed, official.medianMonths)
      : undefined
  const trend =
    official?.trend === "up"
      ? "slower"
      : official?.trend === "down"
        ? "faster"
        : official?.trend === "flat"
          ? "unchanged"
          : null
  return (
    <main className="workspace case-page">
      <h1>My case</h1>
      <p>Explore the typical wait for your case.</p>
      {!search.form && <h2>What are you waiting on?</h2>}
      {!notFound && (
        <div className="case-controls">
          <FormPicker
            forms={forms}
            unavailable={result.isError}
            onRetry={() => void result.refetch()}
            value={search.form}
            label="Choose your case"
            initiallyOpen={!search.form}
            onChange={(form) => void navigate({ search: { ...search, form } })}
          />
          {search.form && (
            <label>
              <span>When did you file? (optional)</span>
              <input
                ref={filedInput}
                aria-label="When did you file? (optional)"
                type="date"
                defaultValue={search.filed ?? ""}
                onChange={(e) => {
                  const filed = e.currentTarget.value
                  if (validFiled(filed)) {
                    committed.current = filed
                    void navigate({ search: { ...search, filed } })
                  }
                }}
                onBlur={(e) => {
                  const input = e.currentTarget
                  if (validFiled(input.value)) return
                  if (!input.value && !input.validity.badInput) {
                    committed.current = undefined
                    void navigate({ search: { ...search, filed: undefined } })
                  } else input.value = committed.current ?? ""
                }}
              />
              {!search.filed && (
                <span className="case-date-hint">
                  Add it to see your estimated date
                </span>
              )}
            </label>
          )}
        </div>
      )}
      {search.form && (result.isLoading || result.isPlaceholderData) && (
        <p role="status">Loading case data…</p>
      )}
      {search.form && result.isError && (
        <p role="alert">
          {notFound ? (
            <>
              This form is not in the catalog.{" "}
              <button
                onClick={() =>
                  void navigate({
                    search: { ...search, form: "", view: "case" },
                  })
                }
              >
                Choose a form
              </button>
              .
            </>
          ) : (
            <>
              Case data unavailable.{" "}
              <button onClick={() => void result.refetch()}>Try again</button>
            </>
          )}
        </p>
      )}
      {data && (
        <>
          <div className="case-grid">
            <section
              className="case-answer"
              style={{
                background: formHue(search.form),
                color: formInk(search.form),
              }}
            >
              <h2>
                {search.filed
                  ? "Your estimated decision"
                  : "How long it usually takes"}
              </h2>
              <strong>
                {official?.medianMonths == null
                  ? "Not available"
                  : estimate
                    ? `Around ${dateLabel(estimate)}`
                    : `About ${formatMonths(official.medianMonths)} months`}
              </strong>
              {estimate && estimate.getTime() < now && (
                <p>
                  That date has passed. If you're still waiting, your case is
                  taking longer than the typical wait.
                </p>
              )}
              <p>
                {categoryLabel(data.categoryLabel, search.form)} · USCIS data
                {periodLabel(official?.period) &&
                  `, ${periodLabel(official?.period)}`}
                {official?.asOfDate &&
                  ` (as of ${humanDate(official.asOfDate)})`}
              </p>
              {official?.medianMonths == null && official?.reason && (
                <p>USCIS hasn't published a typical wait for this form.</p>
              )}
              <h3>What others reported</h3>
              {community &&
              community.p25Days != null &&
              community.p75Days != null ? (
                <strong className="case-range">
                  {search.filed ? "If your wait is like others" : "People"}
                  {community.filingYear != null
                    ? ` who filed in ${community.filingYear}`
                    : " who filed"}
                  :{" "}
                  {search.filed
                    ? dateRange(
                        addDays(search.filed, community.p25Days),
                        addDays(search.filed, community.p75Days)
                      )
                    : `about ${reportedRange(community.p25Days, community.p75Days)}`}
                </strong>
              ) : (
                <p>
                  {community?.reason === "insufficient"
                    ? "Not enough reports yet to show a range."
                    : community?.p25Reason === "unreached" ||
                        community?.p75Reason === "unreached"
                      ? (community?.filingYear ?? year) != null
                        ? `Too many people who filed in ${community?.filingYear ?? year} are still waiting to show a range.`
                        : "Too many people are still waiting to show a range."
                      : data.summary?.eligibleReports === 0
                        ? "No community reports for this form yet."
                        : data.summary?.eligibleReports == null
                          ? "Community timelines aren't available for this form yet."
                          : (community?.filingYear ?? year) != null
                            ? `No community reports yet from people who filed in ${community?.filingYear ?? year}.`
                            : "No community reports yet for this filing period."}
                </p>
              )}
              {community &&
                ((community.p25Days != null && community.p75Days != null) ||
                  community.asOfDate) && (
                  <p>
                    VisaJourney
                    {community.asOfDate &&
                      ` · as of ${humanDate(community.asOfDate)}`}
                  </p>
                )}
              {search.filed && <p>Estimates, not USCIS commitments.</p>}
            </section>
            <section className="case-panel">
              <h2>Trend</h2>
              <p>
                {trend &&
                official?.medianMonths != null &&
                official.previousMedianMonths != null &&
                official.period &&
                official.previousPeriod
                  ? `Waits are ${trend}: ${formatMonths(official.previousMedianMonths)} months (${periodLabel(official.previousPeriod)}) to ${formatMonths(official.medianMonths)} months (${periodLabel(official.period)}).`
                  : "Not enough data to compare periods."}
              </p>
              <MiniTrend values={recentValues(data.trend)} />
            </section>
            {(search.form === "I-485" ||
              search.form === "I-765" ||
              search.form === "I-129") && (
              <section className="case-panel">
                <h2>Next step</h2>
                {search.form === "I-485" && (
                  <Link to="/bulletin" search={{}}>
                    Check the visa bulletin
                  </Link>
                )}
                {search.form === "I-765" && (
                  <Link
                    to="/trends"
                    search={{ form: "I-765", journey: "students" }}
                  >
                    OPT / STEM OPT?
                  </Link>
                )}
                {search.form === "I-129" && (
                  <Link
                    to="/trends"
                    search={{
                      form: "I-129",
                      journey: "workers",
                      insight: "h1b-employers",
                    }}
                  >
                    H-1B employers
                  </Link>
                )}
              </section>
            )}
          </div>
          {data.freshness.some((f) => f.latestAttemptFailed) && (
            <p role="status">
              A recent source update failed; data may be older.
            </p>
          )}
          <details className="case-details">
            <summary>Method and population</summary>
            <p>
              Official: {official?.population ?? "Population unavailable."}{" "}
              {official?.reason}
            </p>
            <p>
              Community: {community?.population ?? "Population unavailable."}{" "}
              {community?.method} Self-reported timelines are not verified.
            </p>
          </details>
        </>
      )}
      <div className="case-links">
        <Link to="/community" search={{ sort: "new", form: search.form }}>
          {search.form ? `Community for ${search.form}` : "Community"}
        </Link>
        <details>
          <summary>More data</summary>
          <div>
            {search.form && (
              <Link to="/trends" search={{ form: search.form }}>
                Trends for {search.form}
              </Link>
            )}
            <Link to="/bulletin" search={{}}>
              Visa bulletin
            </Link>
            <Link
              to="/trends"
              search={{
                form: "I-765",
                journey: "students",
                insight: "student-posts",
              }}
            >
              Student insights
            </Link>
            <Link
              to="/trends"
              search={{
                form: "I-129",
                journey: "workers",
                insight: "h1b-employers",
              }}
            >
              Worker insights
            </Link>
          </div>
        </details>
      </div>
    </main>
  )
}
