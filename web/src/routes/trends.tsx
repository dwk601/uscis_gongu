import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense, useState, type CSSProperties } from "react"
import {
  communityQuery,
  formQuery,
  formsQuery,
  type OfficialPoint,
} from "@/lib/api"
import { estimateDate, latestMedian } from "@/lib/estimate"
import { formHue } from "@/lib/palette"

const DataChart = lazy(() => import("@/components/data-chart"))
type Search = { form: string; series?: string; filed?: string }
export const Route = createFileRoute("/trends")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    form:
      typeof search.form === "string" && /^[-A-Z0-9]+$/.test(search.form)
        ? search.form
        : "I-485",
    series: typeof search.series === "string" ? search.series : undefined,
    filed:
      typeof search.filed === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(search.filed)
        ? search.filed
        : undefined,
  }),
  component: Trends,
})
const month = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
const months = (days: number | null) =>
  days == null ? null : Math.round((days / 30.44) * 10) / 10
function chartRows(points: OfficialPoint[]) {
  const sorted = points
    .filter((p) => p.quarterStart)
    .slice()
    .sort((a, b) => a.quarterStart!.localeCompare(b.quarterStart!))
  const rows: {
    x: number
    label: string
    value: number | null
    other: number | null
    received: number | null
    completed: number | null
  }[] = []
  for (const point of sorted) {
    const x = Date.parse(`${point.quarterStart}T00:00:00Z`)
    if (rows.length) {
      const previous = new Date(rows.at(-1)!.x)
      previous.setUTCMonth(previous.getUTCMonth() + 3)
      while (previous.getTime() < x) {
        rows.push({
          x: previous.getTime(),
          label: month(previous),
          value: null,
          other: null,
          received: null,
          completed: null,
        })
        previous.setUTCMonth(previous.getUTCMonth() + 3)
      }
    }
    rows.push({
      x,
      label: `FY${point.fiscalYear} Q${point.quarter}`,
      value: point.processingMonths,
      other: point.completed,
      received: point.received,
      completed: point.completed,
    })
  }
  return rows
}
function Trends() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const update = (next: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })
  const forms = useQuery(formsQuery())
  const detail = useQuery(formQuery(search.form))
  const community = useQuery(communityQuery(search.form))
  const [visa, setVisa] = useState<string | null | undefined>(undefined)
  const [now] = useState(Date.now)
  const summary = forms.data?.forms.find((f) => f.form === search.form)
  const official =
    detail.data?.official.find((s) => s.id === search.series) ??
    detail.data?.official.find((s) => s.id === summary?.defaultSeries) ??
    detail.data?.official[0]
  const median = latestMedian(official?.points ?? [])
  const date =
    median?.processingMonths && search.filed
      ? estimateDate(search.filed, median.processingMonths)
      : undefined
  const rows = chartRows(official?.points ?? [])
  const candidates = community.data?.series ?? []
  const latestCohort = (points: (typeof candidates)[number]["points"]) =>
    points
      .filter((p) => p.p50 != null)
      .slice()
      .sort((a, b) => (b.filingYear ?? 0) - (a.filingYear ?? 0))[0]
  const selected =
    (visa === undefined
      ? undefined
      : candidates.find((s) => s.visaType === visa)) ??
    [...candidates].sort(
      (a, b) =>
        (latestCohort(b.points)?.sampleSize ?? 0) -
        (latestCohort(a.points)?.sampleSize ?? 0)
    )[0]
  const cohort = selected?.points
    .filter((p) => p.p50 != null)
    .slice()
    .sort((a, b) => (b.filingYear ?? 0) - (a.filingYear ?? 0))[0]
  const communityRows =
    selected?.points
      .filter((p) => p.filingYear != null)
      .slice()
      .sort((a, b) => a.filingYear! - b.filingYear!)
      .map((p) => ({
        x: p.filingYear!,
        label: String(p.filingYear),
        value: months(p.p50),
        low: months(p.p10),
        high: months(p.p90),
      })) ?? []
  return (
    <main
      className="workspace"
      style={{ "--hue": formHue(search.form) } as CSSProperties}
    >
      <div className="controls" aria-label="Form">
        {forms.data?.forms
          .filter((f) => f.featured)
          .map((f) => (
            <button
              key={f.form}
              className="chip"
              aria-pressed={f.form === search.form}
              onClick={() => {
                setVisa(undefined)
                update({ form: f.form, series: undefined })
              }}
            >
              {f.form}
            </button>
          ))}
        <select
          className="field"
          aria-label="More forms"
          value={summary && !summary.featured ? search.form : ""}
          onChange={(e) => {
            if (e.target.value) {
              setVisa(undefined)
              update({ form: e.target.value, series: undefined })
            }
          }}
        >
          <option value="">More forms</option>
          {forms.data?.forms
            .filter((f) => !f.featured)
            .map((f) => (
              <option key={f.form} value={f.form}>
                {f.form} · {f.name}
              </option>
            ))}
        </select>
        <label className="field-label">
          Filed{" "}
          <input
            className="field"
            type="date"
            value={search.filed ?? ""}
            onChange={(e) => update({ filed: e.target.value || undefined })}
          />
        </label>
      </div>
      {forms.isError && (
        <p className="error">
          Forms unavailable.{" "}
          <button onClick={() => void forms.refetch()}>Try again</button>
        </p>
      )}
      <h1>{detail.data?.name ?? search.form}</h1>
      {(detail.data?.official.length ?? 0) > 1 && (
        <div className="controls" aria-label="Case category">
          {detail.data!.official.map((s) => (
            <button
              className="chip"
              aria-pressed={s.id === official?.id}
              key={s.id}
              onClick={() => update({ series: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {detail.isLoading ? (
        <div className="skeleton" aria-label="Loading official data" />
      ) : detail.isError ? (
        <p className="error">
          Official data unavailable.{" "}
          <button onClick={() => void detail.refetch()}>Try again</button>
        </p>
      ) : (
        <>
          <div className="workspace-grid">
            <section
              className="panel estimate"
              style={search.form === "I-131" ? { color: "#fff" } : undefined}
            >
              <div>
                <small>USCIS · {official?.label}</small>
                <h2>
                  {!median
                    ? "No recent median"
                    : date
                      ? `Estimated around ${month(date)}`
                      : `${median.processingMonths} months typical`}
                </h2>
                {date && date.getTime() < now && (
                  <p>This estimate has likely passed the median.</p>
                )}
              </div>
              <div>
                {median && (
                  <small>
                    {median.processingMonths} mo median · USCIS FY
                    {String(median.fiscalYear).slice(-2)} Q{median.quarter}
                  </small>
                )}
                {!search.filed && (
                  <label className="date-label">
                    Add your filing date{" "}
                    <input
                      type="date"
                      value=""
                      onChange={(e) =>
                        update({ filed: e.target.value || undefined })
                      }
                    />
                  </label>
                )}
              </div>
            </section>
            <Suspense fallback={<div className="skeleton" />}>
              <DataChart
                title="Official wait trend · months"
                rows={rows}
                hue={formHue(search.form)}
                calendar
              />
            </Suspense>
          </div>
          <p className="muted">
            Latest pending:{" "}
            {official?.points.at(-1)?.pending?.toLocaleString() ??
              "unavailable"}
          </p>
          <div className="workspace-grid">
            <Suspense fallback={<div className="skeleton" />}>
              <DataChart
                title="Quarterly volume · received and completed"
                rows={rows.map((r) => ({
                  ...r,
                  value: r.received,
                  other: r.completed,
                }))}
                hue={formHue(search.form)}
                second="Completed"
                calendar
              />
            </Suspense>
            <section className="panel">
              <h2>Community timelines</h2>
              <p className="muted">Self-reported · VisaJourney</p>
              {community.isLoading ? (
                <div className="skeleton" aria-label="Loading community data" />
              ) : community.isError ? (
                <p>
                  Community data unavailable.{" "}
                  <button onClick={() => void community.refetch()}>
                    Try again
                  </button>
                </p>
              ) : !cohort ? (
                <p>No community timeline available.</p>
              ) : (
                <>
                  <div className="controls">
                    {candidates.length > 1 &&
                      candidates.map((s) => (
                        <button
                          key={s.visaType ?? "all"}
                          className="chip"
                          aria-pressed={s === selected}
                          onClick={() => setVisa(s.visaType)}
                        >
                          {s.visaType || "All"}
                        </button>
                      ))}
                  </div>
                  <div className="big-number">{months(cohort.p50)} months</div>
                  <p className="community-info">
                    p10–p90: {months(cohort.p10) ?? "—"}–
                    {months(cohort.p90) ?? "—"} months
                    <br />
                    {cohort.filingYear} cohort · {cohort.completed ?? "—"}{" "}
                    completed / {cohort.sampleSize ?? "—"} reports
                    <br />
                    {cohort.pendingShare != null
                      ? `${Math.round(cohort.pendingShare * 100)}% pending`
                      : "Pending share unavailable"}
                    <br />
                    {selected?.meaning}
                  </p>
                </>
              )}
            </section>
          </div>
          {cohort && (
            <div className="workspace-grid">
              <Suspense fallback={<div className="skeleton" />}>
                <DataChart
                  title="Community percentiles · months"
                  rows={communityRows}
                  hue={formHue(search.form)}
                  band
                />
              </Suspense>
            </div>
          )}
        </>
      )}
    </main>
  )
}
