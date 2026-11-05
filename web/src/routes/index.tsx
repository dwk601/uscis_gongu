import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import {
  bulletinQuery,
  formQuery,
  formsQuery,
  type OfficialPoint,
} from "@/lib/api"
import { formatMonths, latestMedian, quarterLabel } from "@/lib/estimate"
import { categoryHue, formHue } from "@/lib/palette"
import { categoryLabel } from "@/lib/labels"
import { JourneyPicker } from "@/components/journey-picker"
import { availableJourneyForms, type JourneyId } from "@/lib/journeys"

export const Route = createFileRoute("/")({ component: Home })

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
  if (valid.length < 2) return <strong>Explore wait trends</strong>
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
      viewBox="0 0 240 80"
      role="img"
      aria-label="USCIS median processing time in recent quarters"
    >
      {values.map((value, index) =>
        value == null ? null : (
          <circle
            key={`point-${index}`}
            cx={(index / Math.max(values.length - 1, 1)) * 240}
            cy={70 - ((value - min) / span) * 60}
            r="2.5"
            fill="#171717"
          />
        )
      )}
      {segments.map((segment, index) => (
        <path
          key={index}
          d={segment}
          fill="none"
          stroke="#171717"
          strokeWidth="3"
        />
      ))}
    </svg>
  )
}

function Home() {
  const navigate = useNavigate()
  const [form, setForm] = useState("I-485")
  const [journey, setJourney] = useState<JourneyId>("all")
  const forms = useQuery(formsQuery())
  const available =
    journey === "all"
      ? (forms.data?.forms.map((f) => ({ form: f.form, label: f.name })) ?? [])
      : availableJourneyForms(journey, forms.data?.forms)
  const effectiveForm = available.find((f) => f.form === form) ?? available[0]
  const detail = useQuery(formQuery("I-485"))
  const bulletin = useQuery(bulletinQuery("EB2", "final_action"))
  const series = detail.data?.official.find(
    (s) =>
      s.id === forms.data?.forms.find((f) => f.form === "I-485")?.defaultSeries
  )
  const median = latestMedian(series?.points ?? [])
  const trendPoints = (series?.points ?? [])
    .filter((p) => p.quarterStart && p.processingMonths != null)
    .slice()
    .sort((a, b) => a.quarterStart!.localeCompare(b.quarterStart!))
    .slice(-12)
  const trendEnds = [trendPoints[0], trendPoints.at(-1)]
  const cutoff = bulletin.data?.series
    .find((s) => s.country === "ALL")
    ?.points.at(-1)
  return (
    <main className="landing">
      <section className="hero">
        <h1>Know when your case lands.</h1>
        <p>Free case insights. No sign-up needed.</p>
        <div className="landing-journeys">
          <h2>What brings you here?</h2>
          <JourneyPicker
            value={journey}
            variant="cards"
            onChange={setJourney}
          />
        </div>
        <form
          className="checker"
          onSubmit={(event) => {
            event.preventDefault()
            const filed = new FormData(event.currentTarget).get("filed")
            void navigate({
              to: "/trends",
              search: {
                form: effectiveForm!.form,
                journey,
                filed: typeof filed === "string" && filed ? filed : undefined,
                series: undefined,
              },
            })
          }}
        >
          {forms.isLoading ? (
            <span role="status">Loading forms…</span>
          ) : forms.isError ? (
            <span className="error">
              Forms unavailable.{" "}
              <button type="button" onClick={() => void forms.refetch()}>
                Try again
              </button>
            </span>
          ) : available.length === 0 ? (
            <span role="status">No forms available for this journey.</span>
          ) : journey === "all" ? (
            <select
              aria-label="Case form"
              value={effectiveForm?.form}
              onChange={(e) => setForm(e.target.value)}
            >
              {forms.data?.forms
                .filter((f) => f.featured)
                .map((f) => (
                  <option key={f.form} value={f.form}>
                    {f.name} · {f.form}
                  </option>
                ))}
              <optgroup label="More forms">
                {forms.data?.forms
                  .filter((f) => !f.featured)
                  .map((f) => (
                    <option key={f.form} value={f.form}>
                      {f.name} · {f.form}
                    </option>
                  ))}
              </optgroup>
            </select>
          ) : (
            <div
              className="landing-form-choices"
              role="group"
              aria-label="Case form"
            >
              {available.map((f) => (
                <button
                  type="button"
                  className="chip"
                  key={f.form}
                  aria-pressed={effectiveForm?.form === f.form}
                  onClick={() => setForm(f.form)}
                >
                  {f.label} <span className="form-code">· {f.form}</span>
                </button>
              ))}
            </div>
          )}
          <label className="landing-date">
            Filed (optional)
            <input name="filed" type="date" />
          </label>
          <button
            className="primary"
            disabled={forms.isLoading || forms.isError || !effectiveForm}
          >
            Check wait time
          </button>
        </form>
      </section>
      <p className="examples-label">Explore examples</p>
      <div className="tray">
        <Link
          className="artifact"
          style={{ background: formHue("I-485") }}
          to="/trends"
          search={{ form: "I-485", series: undefined, filed: undefined }}
        >
          <strong>
            {median?.processingMonths != null
              ? `${formatMonths(median.processingMonths)} months`
              : "Explore wait times"}
          </strong>
          <small>
            Green card application · I-485 · Typical wait · USCIS
            <br />
            See the data <ArrowRight size={14} aria-hidden="true" />
          </small>
        </Link>
        <Link
          className="artifact"
          style={{ background: formHue("I-485") }}
          to="/trends"
          search={{ form: "I-485", series: undefined, filed: undefined }}
        >
          <MiniTrend values={recentValues(series?.points ?? [])} />
          {trendPoints.length >= 2 && (
            <small>
              {trendEnds
                .map(
                  (p) =>
                    `${formatMonths(p!.processingMonths!)} mo · ${quarterLabel(p!.fiscalYear, p!.quarter)}`
                )
                .join(" to ")}
            </small>
          )}
          <small>
            Green card application · I-485 · Typical wait trend · USCIS
            <br />
            Explore trends <ArrowRight size={14} aria-hidden="true" />
          </small>
        </Link>
        <Link
          className="artifact"
          style={{ background: categoryHue("EB2") }}
          to="/bulletin"
          search={{ category: "EB2", chart: "final_action", country: "ALL" }}
        >
          <strong>
            {cutoff?.status === "current"
              ? "Current"
              : cutoff?.status === "unavailable"
                ? "Unavailable"
                : cutoff?.cutoff
                  ? new Date(`${cutoff.cutoff}T00:00:00Z`).toLocaleDateString(
                      "en-US",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      }
                    )
                  : "Explore dates"}
          </strong>
          <small>
            {categoryLabel("EB2")} · Visa bulletin
            <br />
            View bulletin <ArrowRight size={14} aria-hidden="true" />
          </small>
        </Link>
      </div>
      <p className="source">
        Sources: USCIS, U.S. Department of State &amp; VisaJourney
      </p>
    </main>
  )
}
