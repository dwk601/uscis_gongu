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
  ): { form: string; filed?: string } => ({
    form:
      typeof s.form === "string" && /^[A-Z0-9-]{1,12}$/.test(s.form)
        ? s.form
        : "",
    filed: validFiled(s.filed) ? (s.filed as string) : undefined,
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
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
function dateRange(start: Date, end: Date) {
  const first =
    start.getUTCFullYear() === end.getUTCFullYear()
      ? start.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : dateLabel(start)
  return `${first} – ${dateLabel(end)}`
}
function humanDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : dateLabel(date)
}
function categoryLabel(label: string, form: string) {
  if (label === "Family") return "Family-based"
  if (label === "Employment") return "Employment-based"
  if (label === "Adjustment Of Status" && form === "I-765")
    return "While a green card is pending"
  return label
}
function reportedRange(low: number, high: number) {
  if (low < 2 * 30.44)
    return `${low} days – ${high < 2 * 30.44 ? `${high} days` : `${formatMonths(high / 30.44)} months`}`
  return `${formatMonths(low / 30.44)}–${formatMonths(high / 30.44)} months`
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
  if (!period) return "Period unavailable"
  const date = new Date(`${period}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return "Period unavailable"
  const month = date.getUTCMonth()
  return quarterLabel(
    date.getUTCFullYear() + (month >= 9 ? 1 : 0),
    Math.floor(((month + 3) % 12) / 3) + 1
  )
}

function Home() {
  const search = Route.useSearch()
  const [now] = useState(() => Date.now())
  useEffect(() => {
    if (search.form) sessionStorage.setItem("gongu-last-case-form", search.form)
  }, [search.form])
  const navigate = useNavigate({ from: "/" })
  const year = search.filed ? Number(search.filed.slice(0, 4)) : undefined
  const result = useQuery({
    ...caseQuery(search.form || "I-485", year),
    placeholderData: keepPreviousData,
  })
  const client = useQueryClient()
  const forms =
    result.data?.forms ??
    client
      .getQueriesData<CaseResponse>({ queryKey: ["uscis", "case"] })
      .find(([, value]) => value?.forms)?.[1]?.forms
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
      <div className="case-controls">
        <FormPicker
          forms={forms}
          unavailable={result.isError}
          value={search.form}
          label="Choose your case"
          initiallyOpen={!search.form}
          onChange={(form) => void navigate({ search: { ...search, form } })}
        />
        {search.form && (
          <label>
            When did you file? (optional)
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
      {search.form && (result.isLoading || result.isPlaceholderData) && (
        <p role="status">Loading case data…</p>
      )}
      {result.isError && (
        <p role="alert">
          {(result.error as { status?: number })?.status === 404 ? (
            <>
              This form is not in the catalog.{" "}
              <button
                onClick={() =>
                  void navigate({ search: { ...search, form: "" } })
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
                {categoryLabel(data.categoryLabel, search.form)} · USCIS data,{" "}
                {periodLabel(official?.period)}
                {official?.asOfDate &&
                  ` (as of ${humanDate(official.asOfDate)})`}
              </p>
              {official?.medianMonths == null && official?.reason && (
                <p>Official median unavailable for this form.</p>
              )}
              <h3>What others reported</h3>
              {community &&
              community.p25Days != null &&
              community.p75Days != null ? (
                <strong className="case-range">
                  People
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
                    ? "Not enough reports for a range."
                    : community?.p25Reason === "unreached" ||
                        community?.p75Reason === "unreached"
                      ? "A range has not yet been reached."
                      : "Range unavailable for this cohort."}
                </p>
              )}
              {community && (
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
                  <Link
                    to="/bulletin"
                    search={{
                      category: "F2A",
                      chart: "final_action",
                      country: "ALL",
                    }}
                  >
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
            <Link
              to="/bulletin"
              search={{
                category: "EB2",
                chart: "final_action",
                country: "ALL",
              }}
            >
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
