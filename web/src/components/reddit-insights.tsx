import { useQuery } from "@tanstack/react-query"
import { areaY, barY, defineChart, lineY } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scaleUtc } from "@tanstack/charts/scales/time"
import { useState } from "react"
import {
  redditDiscussionQuery,
  redditTalkQuery,
  redditTimelineQuery,
  movement,
  type Bulletin,
  type RedditPoint,
} from "@/lib/api"

function WaitChart({ points }: { points: RedditPoint[] }) {
  const rows = points
    .filter((p) => p.filedMonth)
    .map((p) => ({
      x: new Date(`${p.filedMonth}T00:00:00Z`),
      value: p.p50Days == null ? null : p.p50Days / 30.44,
      low: p.p10Days == null ? null : p.p10Days / 30.44,
      high: p.p90Days == null ? null : p.p90Days / 30.44,
    }))
  if (rows.length < 3) return null
  const complete: typeof rows = []
  for (const row of rows) {
    if (complete.length) {
      const next = new Date(complete.at(-1)!.x)
      next.setUTCMonth(next.getUTCMonth() + 1)
      while (next < row.x) {
        complete.push({ x: new Date(next), value: null, low: null, high: null })
        next.setUTCMonth(next.getUTCMonth() + 1)
      }
    }
    complete.push(row)
  }
  const quarters = new Map<string, number>()
  for (const p of points)
    if (p.quarterStart && p.processingMonths != null)
      quarters.set(p.quarterStart, p.processingMonths)
  const marks = [...quarters].map(([quarter, value]) => {
    const start = new Date(`${quarter}T00:00:00Z`),
      end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 3)
    end.setUTCDate(end.getUTCDate() - 1)
    return lineY(
      [
        { x: start, value },
        { x: end, value },
      ],
      {
        x: "x",
        y: "value",
        stroke: "var(--ink)",
        strokeWidth: 2,
        strokeDasharray: "5 3",
      }
    )
  })
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [r.high ?? 0, r.value ?? 0]),
    ...quarters.values()
  )
  const definition = defineChart({
    marks: [
      areaY(complete, {
        x: "x",
        y1: "low",
        y2: "high",
        fill: "#f2703d",
        fillOpacity: 0.2,
      }),
      lineY(complete, {
        x: "x",
        y: "value",
        stroke: "#f2703d",
        strokeWidth: 2,
        points: true,
      }),
      ...marks,
    ],
    scales: {
      x: { scale: scaleUtc },
      y: { scale: scaleLinear().domain([0, max]) },
    },
  })
  return (
    <>
      <p>
        Reddit median and p10–p90 band · USCIS median for cases completed that
        quarter (dashed) · months
      </p>
      <Chart
        definition={definition}
        ariaLabel="Reddit and USCIS wait times in months; details in data table"
        initialWidth={600}
        height={220}
      />
    </>
  )
}
type ActivityRow = { x: Date; first: number | null; second: number | null }
function ActivityChart({
  rows,
  title,
  bars = false,
}: {
  rows: ActivityRow[]
  title: string
  bars?: boolean
}) {
  const complete: ActivityRow[] = []
  for (const row of rows) {
    if (complete.length) {
      const next = new Date(complete.at(-1)!.x)
      next.setUTCMonth(next.getUTCMonth() + 1)
      while (next < row.x) {
        complete.push({ x: new Date(next), first: null, second: null })
        next.setUTCMonth(next.getUTCMonth() + 1)
      }
    }
    complete.push(row)
  }
  const max = Math.max(1, ...rows.flatMap((r) => [r.first ?? 0, r.second ?? 0]))
  const definition = defineChart({
    marks: bars
      ? [barY(complete, { x: "x", y: "first", fill: "#f2703d" })]
      : [
          lineY(complete, {
            x: "x",
            y: "first",
            stroke: "#f2703d",
            strokeWidth: 2,
          }),
          lineY(complete, {
            x: "x",
            y: "second",
            stroke: "var(--ink)",
            strokeWidth: 2,
            strokeDasharray: "5 3",
          }),
        ],
    scales: {
      x: { scale: scaleUtc().domain([rows[0].x, rows.at(-1)!.x]) },
      y: { scale: scaleLinear().domain([0, max]) },
    },
    margin: { left: 70, right: 16 },
  })
  return (
    <>
      <p>{title}</p>
      <Chart
        definition={definition}
        ariaLabel={`${title}; details in data table`}
        initialWidth={600}
        height={200}
      />
    </>
  )
}
const display = (n: number | null) => (n == null ? "—" : n.toLocaleString())
const months = (n: number | null) => (n == null ? "—" : (n / 30.44).toFixed(1))
function Coverage({
  from,
  through,
}: {
  from: string | null
  through: string | null
}) {
  return (
    <p>
      Observed {from ?? "—"} through {through ?? "—"}; the first and last months
      may be partial. Observed through is not an ETL-success timestamp or
      completeness guarantee. Counts reflect changing community size, subreddit
      coverage and archive coverage, not just interest or demand.
    </p>
  )
}
function State({
  loading,
  error,
  retry,
}: {
  loading: boolean
  error: boolean
  retry: () => void
}) {
  return loading ? (
    <p>Loading Reddit data…</p>
  ) : error ? (
    <p className="error">
      Reddit data unavailable. <button onClick={retry}>Try again</button>
    </p>
  ) : null
}
export function RedditWait({ form }: { form: string }) {
  const q = useQuery(redditTimelineQuery(form))
  const [caseType, setCaseType] = useState("")
  const [processing, setProcessing] = useState("all")
  const types = [...new Set(q.data?.series.map((s) => s.caseType) ?? [])]
  const type = types.includes(caseType) ? caseType : types[0]
  const options = q.data?.series.filter((s) => s.caseType === type) ?? []
  const key = (premium: boolean | null) =>
    premium == null ? "all" : premium ? "premium" : "regular"
  const selected =
    options.find((s) => key(s.premium) === processing) ?? options[0]
  return (
    <>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data &&
        (!selected ? (
          <p>No Reddit timeline available.</p>
        ) : (
          <>
            <div
              className="controls"
              role="group"
              aria-label="Reddit case type"
            >
              {types.map((t) => (
                <button
                  className="chip"
                  key={t}
                  aria-pressed={t === type}
                  onClick={() => {
                    setCaseType(t)
                    setProcessing("all")
                  }}
                >
                  {t.replaceAll("_", " ")}
                </button>
              ))}
            </div>
            <div className="controls" role="group" aria-label="Processing">
              {options.map((s) => (
                <button
                  className="chip"
                  key={key(s.premium)}
                  aria-pressed={s === selected}
                  onClick={() => setProcessing(key(s.premium))}
                >
                  {s.premium == null
                    ? "All"
                    : s.premium
                      ? "Premium"
                      : "Regular"}{" "}
                  · {s.points.length} months
                </button>
              ))}
            </div>
            <p>
              All includes unknown processing; subgroup sample thresholds
              differ. Approved reports only; recent cohorts may be biased. These
              are not personalized forecasts. Reddit is grouped by filing month,
              not completion quarter. USCIS median covers cases completed in
              that quarter: {q.data.officialDescription}.
            </p>
            {selected.points.length < 3 &&
              selected.points.map((p, i) => (
                <p key={i}>
                  {p.filedMonth}: {months(p.p50Days)} months median ·{" "}
                  {months(p.p10Days)}–{months(p.p90Days)} months ·{" "}
                  {display(p.approvedReports)} approved reports
                </p>
              ))}
            {selected.points.length >= 3 && (
              <WaitChart points={selected.points} />
            )}
            <details>
              <summary>Data</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Filing month</th>
                      <th>Approved reports</th>
                      <th>Median (months)</th>
                      <th>p10 (months)</th>
                      <th>p90 (months)</th>
                      <th>Official quarter</th>
                      <th>USCIS median (months)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.points.map((p, i) => (
                      <tr key={i}>
                        <td>{p.filedMonth}</td>
                        <td>{display(p.approvedReports)}</td>
                        <td>{months(p.p50Days)}</td>
                        <td>{months(p.p10Days)}</td>
                        <td>{months(p.p90Days)}</td>
                        <td>{p.quarterStart ?? "—"}</td>
                        <td>{display(p.processingMonths)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ))}
    </>
  )
}
export function RedditTalkPanel() {
  const q = useQuery(redditTalkQuery())
  const last = q.data?.months.findLast((p) => p.lcaCases != null)?.month
  const activity =
    q.data?.months
      .filter((p) => p.month)
      .map((p) => ({
        x: new Date(`${p.month}T00:00:00Z`),
        first: p.h1bPosts,
        second: p.lotteryPosts,
      })) ?? []
  const lca =
    q.data?.months
      .filter((p) => p.month)
      .map((p) => ({
        x: new Date(`${p.month}T00:00:00Z`),
        first: p.lcaCases,
        second: p.lcaCertified,
      })) ?? []
  return (
    <section className="panel insight-panel">
      <h1>H-1B talk vs LCA filings</h1>
      <p>
        H-1B case &amp; lottery posts; H-1B policy news counted separately. LCAs
        are not people, petitions, or lottery odds.
      </p>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <>
          <Coverage from={q.data.from} through={q.data.through} />
          {activity.length > 0 && (
            <>
              <ActivityChart
                rows={activity}
                title="Posts: H-1B case (orange), lottery (dashed)"
              />
              <ActivityChart
                rows={lca}
                title="LCA receipts (orange), certified including later withdrawn (dashed)"
              />
            </>
          )}
          {q.data.months.length === 0 ? (
            <p>Nothing to show yet.</p>
          ) : (
            <details open>
              <summary>Monthly data</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>H-1B posts</th>
                      <th>H-1B comments</th>
                      <th>Lottery posts</th>
                      <th>Lottery comments</th>
                      <th>LCA receipts</th>
                      <th>Certified, including later withdrawn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.months.map((p, i) => (
                      <tr key={i}>
                        <td>
                          {p.month}
                          {p.month?.slice(0, 7) === q.data?.from?.slice(0, 7) ||
                          p.month?.slice(0, 7) === q.data?.through?.slice(0, 7)
                            ? " · partial"
                            : ""}
                          {p.month === last ? " · May be incomplete" : ""}
                        </td>
                        <td>{display(p.h1bPosts)}</td>
                        <td>{display(p.h1bComments)}</td>
                        <td>{display(p.lotteryPosts)}</td>
                        <td>{display(p.lotteryComments)}</td>
                        <td>{display(p.lcaCases)}</td>
                        <td>{display(p.lcaCertified)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}
type BulletinPoint = Bulletin["series"][number]["points"][number]
export function RedditDiscussionPanel({ points }: { points: BulletinPoint[] }) {
  const q = useQuery(redditDiscussionQuery())
  return (
    <section className="panel">
      <h2>Reddit discussion</h2>
      <p>
        Employment-topic counts include general visa-bulletin discussion,
        exclude posts classified as adjustment of status, and are not specific
        to this category or country.
      </p>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <>
          <Coverage from={q.data.from} through={q.data.through} />
          {q.data.months.some(
            (p) => p.topic === "employment_green_card" && p.month
          ) && (
            <ActivityChart
              bars
              title="Reddit employment-topic posts"
              rows={q.data.months
                .filter((p) => p.topic === "employment_green_card" && p.month)
                .map((p) => ({
                  x: new Date(`${p.month}T00:00:00Z`),
                  first: p.posts,
                  second: null,
                }))}
            />
          )}
          {q.data.months.filter((p) => p.topic === "employment_green_card")
            .length === 0 ? (
            <p>Nothing to show yet.</p>
          ) : (
            <details open>
              <summary>Monthly data</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Posts</th>
                      <th>Comments</th>
                      <th>Cutoff</th>
                      <th>Movement (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.months
                      .filter((p) => p.topic === "employment_green_card")
                      .map((p, i) => {
                        const official = points.find((o) => o.month === p.month)
                        return (
                          <tr key={i}>
                            <td>
                              {p.month}
                              {p.month?.slice(0, 7) ===
                                q.data?.from?.slice(0, 7) ||
                              p.month?.slice(0, 7) ===
                                q.data?.through?.slice(0, 7)
                                ? " · partial"
                                : ""}
                            </td>
                            <td>{display(p.posts)}</td>
                            <td>{display(p.comments)}</td>
                            <td>
                              {official?.status === "date"
                                ? (official.cutoff ?? "—")
                                : (official?.status ?? "—")}
                            </td>
                            <td>{display(movement(points, p.month))}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}
