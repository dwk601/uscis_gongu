import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  communityQuery,
  formQuery,
  formsQuery,
  type OfficialPoint,
} from "@/lib/api"
import {
  estimateDate,
  latestMedian,
  formatMonths,
  quarterLabel,
} from "@/lib/estimate"
import { formHue } from "@/lib/palette"
import { visaLabel } from "@/lib/labels"
import { JourneyPicker } from "@/components/journey-picker"
import { Insight } from "@/components/insights"
import { BigNumber, EstimateCard } from "@/components/insight-cards"
import {
  availableJourneyForms,
  inferJourney,
  isJourney,
  journeyFor,
  type JourneyId,
} from "@/lib/journeys"

function validFiled(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number(value.slice(0, 4)) < 1990
  )
    return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

function FiledInput({
  value,
  onCommit,
  className,
  inputRef,
}: {
  value?: string
  onCommit: (value?: string) => void
  className?: string
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const lastCommitted = useRef(value)
  const [hint, setHint] = useState("")
  useEffect(() => {
    if (value !== lastCommitted.current) {
      if (inputRef.current) inputRef.current.value = value ?? ""
      lastCommitted.current = value
    }
  }, [value, inputRef])
  return (
    <>
      <input
        ref={inputRef}
        className={className}
        type="date"
        defaultValue={value ?? ""}
        aria-describedby={hint ? "filed-hint" : undefined}
        onChange={(e) => {
          const next = e.currentTarget.value
          if (validFiled(next)) {
            setHint("")
            lastCommitted.current = next
            onCommit(next)
          }
        }}
        onBlur={(e) => {
          const input = e.currentTarget
          if (validFiled(input.value)) return
          const date = new Date(`${input.value}T00:00:00Z`)
          if (
            /^\d{4}-\d{2}-\d{2}$/.test(input.value) &&
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === input.value &&
            Number(input.value.slice(0, 4)) < 1990
          )
            setHint("Enter a date in 1990 or later.")
          else setHint("")
          if (!input.value && !input.validity.badInput) {
            lastCommitted.current = undefined
            onCommit(undefined)
          } else input.value = lastCommitted.current ?? ""
        }}
      />
      {hint && (
        <span id="filed-hint" className="filed-hint" role="status">
          {hint}
        </span>
      )}
    </>
  )
}

const DataChart = lazy(() => import("@/components/data-chart"))
const RedditWait = lazy(() =>
  import("@/components/reddit-insights").then((m) => ({
    default: m.RedditWait,
  }))
)
type Search = {
  form: string
  journey?: JourneyId
  series?: string
  filed?: string
  insight?: string
}
export const Route = createFileRoute("/trends")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    form:
      typeof search.form === "string" && /^[-A-Z0-9]+$/.test(search.form)
        ? search.form
        : "I-485",
    journey: isJourney(search.journey) ? search.journey : undefined,
    series: typeof search.series === "string" ? search.series : undefined,
    insight: typeof search.insight === "string" ? search.insight : undefined,
    filed:
      typeof search.filed === "string" && validFiled(search.filed)
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
      label: quarterLabel(point.fiscalYear, point.quarter),
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
  const [visa, setVisa] = useState<string | null>()
  const [sourceChoice, setSource] = useState<"reddit" | "visajourney">()
  const [now] = useState(Date.now)
  const filedRef = useRef<HTMLInputElement>(null)
  const formRailRef = useRef<HTMLDivElement>(null)
  const journeyRailRef = useRef<HTMLDivElement>(null)
  const requestedJourney = search.journey ?? inferJourney(search.form)
  const journey =
    requestedJourney !== "all" &&
    !journeyFor(requestedJourney)?.forms.some((f) => f.form === search.form)
      ? "all"
      : requestedJourney
  const insightOptions =
    journey === "students"
      ? [
          ["visa-221g", "221(g) wait (older reports)"],
          ["student-posts", "What students post about"],
        ]
      : journey === "workers"
        ? [
            ["h1b-pay", "H‑1B offered pay"],
            ["h1b-employers", "Employers with H‑1B approvals"],
            ["h1b-talk", "H‑1B talk vs LCA filings"],
          ]
        : []
  const insight = insightOptions.some(([id]) => id === search.insight)
    ? search.insight
    : undefined
  useEffect(() => {
    if (!window.matchMedia("(max-width: 700px)").matches) return
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (!cancelled) {
        for (const rail of [journeyRailRef.current, formRailRef.current])
          rail
            ?.querySelector<HTMLElement>('[aria-pressed="true"]')
            ?.scrollIntoView({ block: "nearest", inline: "nearest" })
      }
    })
    return () => {
      cancelled = true
    }
  }, [search.form, journey, forms.data])
  const summary = forms.data?.forms.find((f) => f.form === search.form)
  const choices = availableJourneyForms(journey, forms.data?.forms)
  const preferred = choices.find((f) => f.form === search.form)
  const official =
    detail.data?.official.find((s) => s.id === search.series) ??
    (preferred && "preferredSeriesLabel" in preferred
      ? detail.data?.official.find(
          (s) => s.label === preferred.preferredSeriesLabel
        )
      : undefined) ??
    detail.data?.official.find((s) => s.id === summary?.defaultSeries) ??
    detail.data?.official[0]
  const redditAvailable =
    !!detail.data?.redditOfficialDescription &&
    official?.description === detail.data.redditOfficialDescription
  const source = sourceChoice ?? (redditAvailable ? "reddit" : "visajourney")
  const showReddit = redditAvailable && source === "reddit"
  const median = latestMedian(official?.points ?? [])
  const date =
    median?.processingMonths && search.filed
      ? estimateDate(search.filed, median.processingMonths)
      : undefined
  const rows = chartRows(official?.points ?? [])
  const candidates = (community.data?.series ?? []).filter((series) =>
    series.points.some((point) => point.p50 != null)
  )
  const latestCohort = (points: (typeof candidates)[number]["points"]) =>
    points
      .filter((p) => p.p50 != null)
      .slice()
      .sort((a, b) => (b.filingYear ?? 0) - (a.filingYear ?? 0))[0]
  const selected =
    (visa === undefined
      ? undefined
      : candidates.find((s) => s.visaType === visa)) ??
    (visa === undefined && journey === "students" && search.form === "I-765"
      ? candidates.find((s) => s.visaType === "F-1")
      : undefined) ??
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
      className="workspace trend-workspace"
      style={{ "--hue": formHue(search.form) } as CSSProperties}
    >
      <div ref={journeyRailRef}>
        <JourneyPicker
          variant="compact"
          value={journey}
          onChange={(id) => {
            const available =
              id === "all"
                ? forms.data?.forms
                : availableJourneyForms(id, forms.data?.forms)
            const nextForm = available?.some((f) => f.form === search.form)
              ? search.form
              : (available?.[0]?.form ?? search.form)
            if (nextForm !== search.form) {
              setVisa(undefined)
              setSource(undefined)
            }
            update({
              journey: id,
              insight: undefined,
              form: nextForm,
              ...(nextForm !== search.form ? { series: undefined } : {}),
            })
          }}
        />
      </div>
      {(journey === "students" || journey === "workers") && (
        <>
          <div className="controls" role="group" aria-label="Insights">
            <button
              className="chip"
              aria-pressed={!insight}
              onClick={() => update({ insight: undefined })}
            >
              Case wait
            </button>
            {insightOptions.map(([id, label]) => (
              <button
                key={id}
                className="chip"
                aria-pressed={insight === id}
                onClick={() => update({ insight: id })}
              >
                {label}
              </button>
            ))}
          </div>
          {journey === "students" && !insight && (
            <p>
              {search.form === "I-765" &&
                redditAvailable &&
                "OPT and STEM OPT timelines from Reddit are in Reported waits. "}
              Lottery odds aren't available yet.
            </p>
          )}
        </>
      )}
      {insight ? (
        <Insight id={insight} />
      ) : (
        <>
          <div
            ref={formRailRef}
            className="chip-rail form-rail"
            role="group"
            aria-label="Form"
            tabIndex={0}
          >
            {(journey === "all"
              ? (forms.data?.forms
                  .filter((f) => f.featured)
                  .map((f) => ({ form: f.form, label: f.name })) ?? [])
              : choices
            ).map((f) => (
              <button
                key={f.form}
                className="chip"
                aria-pressed={f.form === search.form}
                onClick={() => {
                  if (f.form !== search.form) {
                    setVisa(undefined)
                    setSource(undefined)
                    update({ form: f.form, journey, series: undefined })
                  }
                }}
              >
                {f.label} <small>· {f.form}</small>
              </button>
            ))}
          </div>
          <div className="controls">
            {journey === "all" && (
              <select
                className="field"
                aria-label="More forms"
                value={summary && !summary.featured ? search.form : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    if (e.target.value !== search.form) {
                      setVisa(undefined)
                      setSource(undefined)
                      update({
                        form: e.target.value,
                        journey,
                        series: undefined,
                      })
                    }
                  }
                }}
              >
                <option value="">More forms</option>
                {forms.data?.forms
                  .filter((f) => !f.featured)
                  .map((f) => (
                    <option key={f.form} value={f.form}>
                      {f.name} · {f.form}
                    </option>
                  ))}
              </select>
            )}
            <label className="field-label">
              Filed{" "}
              <FiledInput
                className="field"
                inputRef={filedRef}
                value={search.filed}
                onCommit={(filed) => update({ filed })}
              />
            </label>
          </div>
          {forms.isError && (
            <p className="error">
              Forms unavailable.{" "}
              <button onClick={() => void forms.refetch()}>Try again</button>
            </p>
          )}
          <h1>
            {detail.data?.name ?? summary?.name ?? search.form}{" "}
            {detail.data?.name && <small>· {search.form}</small>}
          </h1>
          {journey === "students" && search.form === "I-765" && (
            <p>
              OPT / STEM OPT are counted in “All other cases”; this is not an
              OPT-only median.
            </p>
          )}
          {search.form === "I-129" && (
            <p>I-129 data includes temporary work petitions beyond H-1B.</p>
          )}
          {journey === "residents" && search.form === "I-131" && (
            <p>
              Travel &amp; parole documents includes more than reentry permits.
            </p>
          )}
          {(detail.data?.official.length ?? 0) > 1 && (
            <div
              className="chip-rail"
              role="group"
              aria-label="Case category"
              tabIndex={0}
            >
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
                <EstimateCard
                  form={search.form}
                  title={
                    !median
                      ? "No recent median"
                      : date
                        ? `Estimated around ${month(date)}`
                        : `${formatMonths(median.processingMonths!)} months typical`
                  }
                  note={
                    date && date.getTime() < now ? (
                      <p>Past the typical wait.</p>
                    ) : undefined
                  }
                >
                  {median && (
                    <small>
                      Typical wait {formatMonths(median.processingMonths!)} mo ·
                      USCIS, {quarterLabel(median.fiscalYear, median.quarter)} ·{" "}
                      {official?.label}
                    </small>
                  )}
                  {!search.filed && (
                    <button
                      className="date-nudge"
                      type="button"
                      onClick={() => filedRef.current?.focus()}
                    >
                      Add your filing date
                    </button>
                  )}
                </EstimateCard>
                <Suspense fallback={<div className="skeleton" />}>
                  <DataChart
                    title="Official wait trend · months"
                    rows={rows}
                    hue={formHue(search.form)}
                    calendar
                  />
                </Suspense>
              </div>
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
                    pending={
                      official?.points.at(-1)?.pending?.toLocaleString() ??
                      "unavailable"
                    }
                    calendar
                  />
                </Suspense>
                <section className="panel">
                  <h2>Reported waits</h2>
                  {redditAvailable && (
                    <div
                      className="controls"
                      role="group"
                      aria-label="Reported wait source"
                    >
                      <button
                        className="chip"
                        aria-pressed={source === "reddit"}
                        onClick={() => setSource("reddit")}
                      >
                        Reddit
                      </button>
                      <button
                        className="chip"
                        aria-pressed={source === "visajourney"}
                        onClick={() => setSource("visajourney")}
                      >
                        VisaJourney
                      </button>
                    </div>
                  )}
                  {showReddit ? (
                    <Suspense fallback={<div className="skeleton" />}>
                      <RedditWait form={search.form} />
                    </Suspense>
                  ) : (
                    <>
                      <p className="muted">Self-reported · VisaJourney</p>
                      {!community.isLoading &&
                        !community.isError &&
                        candidates.length > 0 && (
                          <div
                            className="controls"
                            role="group"
                            aria-label="Visa route"
                          >
                            {candidates.map((s) => (
                              <button
                                key={s.visaType ?? "not-stated"}
                                className="chip"
                                aria-pressed={s === selected}
                                onClick={() => setVisa(s.visaType)}
                              >
                                {s.visaType == null
                                  ? "Not stated"
                                  : visaLabel(s.visaType, search.form)}
                              </button>
                            ))}
                          </div>
                        )}
                      {community.isLoading ? (
                        <div
                          className="skeleton"
                          aria-label="Loading community data"
                        />
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
                          <BigNumber>{months(cohort.p50)} months</BigNumber>
                          <p className="community-info">
                            {cohort.p10 != null && cohort.p90 != null
                              ? `Middle 80%: ${months(cohort.p10)}–${months(cohort.p90)} months`
                              : "Range unavailable"}
                            <br />
                            Filed in {cohort.filingYear} ·{" "}
                            {cohort.completed ?? "—"} finished reports
                          </p>
                          <details>
                            <summary>About these numbers</summary>
                            {cohort.pendingShare != null
                              ? `${Math.round(cohort.pendingShare * 100)}% pending. `
                              : "Pending share unavailable. "}
                            {selected?.meaning}
                          </details>
                        </>
                      )}
                    </>
                  )}
                </section>
              </div>
              {cohort && !showReddit && (
                <div className="workspace-grid single-chart">
                  <Suspense fallback={<div className="skeleton" />}>
                    <DataChart
                      title="Community wait times · months"
                      rows={communityRows}
                      hue={formHue(search.form)}
                      band
                    />
                  </Suspense>
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}
