import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import {
  bulletinQuery,
  formQuery,
  formsQuery,
  type OfficialPoint,
} from "@/lib/api"
import { latestMedian } from "@/lib/estimate"
import { categoryHue, formHue } from "@/lib/palette"

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
  const forms = useQuery(formsQuery())
  const detail = useQuery(formQuery("I-485"))
  const bulletin = useQuery(bulletinQuery("EB2", "final_action"))
  const series = detail.data?.official.find(
    (s) =>
      s.id === forms.data?.forms.find((f) => f.form === "I-485")?.defaultSeries
  )
  const median = latestMedian(series?.points ?? [])
  const cutoff = bulletin.data?.series
    .find((s) => s.country === "ALL")
    ?.points.at(-1)
  return (
    <main className="landing">
      <section className="hero">
        <h1>Know when your case lands.</h1>
        <p>Free case insights. No sign-up needed.</p>
        <form
          className="checker"
          onSubmit={(event) => {
            event.preventDefault()
            const filed = new FormData(event.currentTarget).get("filed")
            void navigate({
              to: "/trends",
              search: {
                form,
                filed: typeof filed === "string" && filed ? filed : undefined,
                series: undefined,
              },
            })
          }}
        >
          <select
            aria-label="Case form"
            value={form}
            onChange={(e) => setForm(e.target.value)}
          >
            {forms.data?.forms
              .filter((f) => f.featured)
              .map((f) => (
                <option value={f.form} key={f.form}>
                  {f.form} · {f.name}
                </option>
              )) ?? <option value="I-485">I-485 · Green card</option>}
          </select>
          <label className="landing-date">
            Filed (optional)
            <input name="filed" type="date" />
          </label>
          <button className="primary">See my estimate</button>
        </form>
      </section>
      <div className="tray">
        <Link
          className="artifact"
          style={{ background: formHue("I-485") }}
          to="/trends"
          search={{ form: "I-485", series: undefined, filed: undefined }}
        >
          <small>I-485 · USCIS median</small>
          <strong>
            {median?.processingMonths != null
              ? `${median.processingMonths} months`
              : "Explore wait times"}
          </strong>
          <small>See the data →</small>
        </Link>
        <Link
          className="artifact"
          style={{ background: formHue("I-485") }}
          to="/trends"
          search={{ form: "I-485", series: undefined, filed: undefined }}
        >
          <small>I-485 · Median wait trend</small>
          <MiniTrend values={recentValues(series?.points ?? [])} />
          <small>Explore trends →</small>
        </Link>
        <Link
          className="artifact"
          style={{ background: categoryHue("EB2") }}
          to="/bulletin"
          search={{ category: "EB2", chart: "final_action", country: "ALL" }}
        >
          <small>EB-2 · Visa bulletin</small>
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
          <small>View bulletin →</small>
        </Link>
      </div>
      <p className="source">
        Sources: USCIS, U.S. Department of State &amp; VisaJourney
      </p>
    </main>
  )
}
