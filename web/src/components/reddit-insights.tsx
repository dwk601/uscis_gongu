import { useQuery } from "@tanstack/react-query"
import { areaY, barY, defineChart, lineY } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scaleUtc } from "@tanstack/charts/scales/time"
import { useState, type CSSProperties } from "react"
import {
  redditDiscussionQuery,
  redditTalkQuery,
  redditTimelineQuery,
  movement,
  type Bulletin,
  type RedditPoint,
} from "@/lib/api"
import { quarterLabel } from "@/lib/estimate"
import { redditCaseLabels } from "@/lib/labels"
import { chartHue, formHue } from "@/lib/palette"
import { BigNumber } from "@/components/insight-cards"

const day = (value: string) => new Date(`${value}T00:00:00Z`)
const month = (value: string | null | undefined) =>
  value
    ? day(value).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—"
const fullDate = (value: string | null | undefined) =>
  value
    ? day(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—"
const quarter = (value: string | null) => {
  if (!value) return "—"
  const d = day(value),
    m = d.getUTCMonth()
  return quarterLabel(
    d.getUTCFullYear() + (m >= 9 ? 1 : 0),
    Math.floor(((m + 3) % 12) / 3) + 1
  )
}
const display = (n: number | null) => (n == null ? "—" : n.toLocaleString())
const months = (n: number | null) =>
  n == null ? "—" : (Math.round((n / 30.44) * 10) / 10).toLocaleString()
const monthChange = (n: number | null) =>
  n == null
    ? "—"
    : n === 0
      ? "No change"
      : `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString()} days`
const partialMonth = (
  value: string | null | undefined,
  from: string | null,
  through: string | null
) => {
  if (!value) return false
  const first =
    from &&
    value.slice(0, 7) === from.slice(0, 7) &&
    day(from).getUTCDate() !== 1
  const lastDate = through && day(through)
  const last =
    lastDate &&
    value.slice(0, 7) === through!.slice(0, 7) &&
    lastDate.getUTCDate() !==
      new Date(
        Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + 1, 0)
      ).getUTCDate()
  return !!(first || last)
}
const chartStyle = (hue?: string): CSSProperties => {
  const [light, dark] = hue ? chartHue(hue) : ["var(--focus)", "var(--focus)"]
  return { "--chart-light": light, "--chart-dark": dark } as CSSProperties
}
const axis = {
  ticks: { format: (value: number) => value.toLocaleString("en-US") },
}
function Legend({ first, second }: { first: string; second?: string }) {
  return (
    <div className="chart-legend">
      <span>
        <i style={{ background: "var(--chart-stroke)" }} />
        {first}
      </span>
      {second && (
        <span>
          <i className="legend-ink" />
          {second}
        </span>
      )}
    </div>
  )
}
function WaitChart({ points, form }: { points: RedditPoint[]; form: string }) {
  const rows = points
    .filter((p) => p.filedMonth)
    .map((p) => ({
      x: day(p.filedMonth!),
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
  const official = [...quarters].map(([q, value]) => {
    const start = day(q),
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
        fill: "var(--chart-stroke)",
        fillOpacity: 0.18,
      }),
      lineY(complete, {
        x: "x",
        y: "value",
        stroke: "var(--chart-stroke)",
        strokeWidth: 2,
        points: true,
      }),
      ...official,
    ],
    scales: {
      x: { scale: scaleUtc },
      y: { scale: scaleLinear().domain([0, max]), axis },
    },
  })
  return (
    <div className="chart-panel reddit-chart" style={chartStyle(formHue(form))}>
      <Legend
        first="Reddit median · middle 80%"
        second={`USCIS median · ${form === "I-129" ? "all I-129 classifications" : form === "I-765" ? "all other I-765 cases" : "I-140 cases"}, completed that quarter`}
      />
      <Chart
        definition={definition}
        ariaLabel="Reported and USCIS wait times in months; details in data table"
        initialWidth={600}
        height={220}
      />
    </div>
  )
}
type ActivityRow = { x: Date; first: number | null; second: number | null }
type BulletinPoint = Bulletin["series"][number]["points"][number]
function ActivityChart({
  rows,
  title,
  first,
  second,
  from,
  through,
  hue,
  bars = false,
  latest,
  points,
}: {
  rows: ActivityRow[]
  title: string
  first: string
  second?: string
  from: string | null
  through: string | null
  hue?: string
  bars?: boolean
  latest?: string | null
  points?: BulletinPoint[]
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
    complete.push(
      partialMonth(row.x.toISOString().slice(0, 10), from, through)
        ? { ...row, first: null, second: null }
        : row
    )
  }
  const max = Math.max(
    1,
    ...complete.flatMap((r) => [r.first ?? 0, r.second ?? 0])
  )
  const start = new Date(rows[0].x),
    end = new Date(rows.at(-1)!.x)
  start.setUTCDate(start.getUTCDate() - 15)
  end.setUTCMonth(end.getUTCMonth() + 1)
  end.setUTCDate(end.getUTCDate() - 15)
  const lastPoint = complete.find(
    (r) =>
      latest && r.x.toISOString().slice(0, 10) === latest && r.first != null
  )
  const definition = defineChart({
    marks: [
      ...(bars
        ? [barY(complete, { x: "x", y: "first", fill: "var(--chart-stroke)" })]
        : [
            lineY(complete, {
              x: "x",
              y: "first",
              stroke: "var(--chart-stroke)",
              strokeWidth: 2,
            }),
            lineY(complete, {
              x: "x",
              y: "second",
              stroke: "var(--ink)",
              strokeWidth: 2,
              strokeDasharray: "5 3",
            }),
          ]),
      ...(lastPoint
        ? [
            lineY([lastPoint], {
              x: "x",
              y: "first",
              stroke: "var(--chart-stroke)",
              points: true,
            }),
          ]
        : []),
    ],
    scales: {
      x: { scale: scaleUtc().domain([start, end]) },
      y: { scale: scaleLinear().domain([0, max]), axis },
    },
    margin: { left: 70, right: 16 },
  })
  return (
    <div className="chart-panel reddit-chart" style={chartStyle(hue)}>
      <h3>{title}</h3>
      <Legend first={first} second={second} />
      <Chart
        definition={definition}
        ariaLabel={`${title}; details in data table`}
        initialWidth={600}
        height={200}
      />
      {points && (
        <div className="reddit-movement">
          <div className="reddit-movement-track" aria-hidden="true">
            {rows.map((r) => {
              const value = movement(points, r.x.toISOString().slice(0, 10))
              if (value == null) return null
              const position =
                ((r.x.getTime() - start.getTime()) /
                  (end.getTime() - start.getTime())) *
                100
              return (
                <span
                  key={r.x.toISOString()}
                  className={value === 0 ? "reddit-unchanged" : undefined}
                  style={{ left: `${position}%` }}
                  title={`${month(r.x.toISOString().slice(0, 10))}: ${monthChange(value)}`}
                >
                  {value > 0 ? "▲" : value < 0 ? "▼" : "·"}
                </span>
              )
            })}
          </div>
          <p className="muted">
            Cutoff change: ▲ forward · ▼ back
            <span className="reddit-unchanged-legend"> · dot unchanged</span>
          </p>
        </div>
      )}
    </div>
  )
}
function Coverage({
  from,
  through,
}: {
  from: string | null
  through: string | null
}) {
  const first = partialMonth(from, from, null),
    last = partialMonth(through, null, through)
  const note =
    first && last
      ? "first and last months are partial"
      : first
        ? "first month is partial"
        : last
          ? "last month is partial"
          : null
  return (
    <p className="muted">
      Reddit activity {fullDate(from)} – {fullDate(through)}
      {note && ` · ${note}`}
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
    <p role="status">Loading Reddit data…</p>
  ) : error ? (
    <p className="error" role="alert">
      Reddit data unavailable. <button onClick={retry}>Try again</button>
    </p>
  ) : null
}
export function RedditWait({ form }: { form: string }) {
  const q = useQuery(redditTimelineQuery(form))
  const [caseType, setCaseType] = useState<string | null>()
  const [processing, setProcessing] = useState("all")
  const types = [...new Set(q.data?.series.map((s) => s.caseType) ?? [])]
  const type =
    caseType !== undefined && types.includes(caseType) ? caseType : types[0]
  const options = q.data?.series.filter((s) => s.caseType === type) ?? []
  const key = (premium: boolean | null) =>
    premium == null ? "all" : premium ? "premium" : "regular"
  const selected =
    options.find((s) => key(s.premium) === processing) ?? options[0]
  const cohorts =
    selected?.points
      .filter((p) => p.filedMonth && p.p50Days != null)
      .slice()
      .sort((a, b) => b.filedMonth!.localeCompare(a.filedMonth!)) ?? []
  const latest =
    cohorts.find((p) => p.quarterStart != null && p.processingMonths != null) ??
    cohorts[0]
  const recentMonths = [
    ...new Set(
      selected?.points
        .map((p) => p.filedMonth)
        .filter((month): month is string => month != null)
    ),
  ]
    .sort()
    .slice(-3)
  const recent =
    latest?.filedMonth != null && recentMonths.includes(latest.filedMonth)
  return (
    <>
      <p className="muted">Self-reported · Reddit</p>
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
                  key={t ?? "unknown"}
                  aria-pressed={t === type}
                  onClick={() => {
                    setCaseType(t)
                    setProcessing("all")
                  }}
                >
                  {t ? (redditCaseLabels[t] ?? t) : "Not stated"}
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
                  · {s.points.length}{" "}
                  {s.points.length === 1 ? "month" : "months"}
                </button>
              ))}
            </div>
            {latest ? (
              <>
                <BigNumber>{months(latest.p50Days)} months</BigNumber>
                <p className="community-info">
                  {latest.p10Days != null && latest.p90Days != null
                    ? `Middle 80%: ${months(latest.p10Days)}–${months(latest.p90Days)} months`
                    : "Range unavailable"}
                  <br />
                  Filed {month(latest.filedMonth)} ·{" "}
                  {display(latest.approvedReports)} approved reports
                  {recent && " · approved so far; recent months skew short"}
                </p>
              </>
            ) : (
              <p>No median available.</p>
            )}
            {selected.points.length >= 3 && (
              <WaitChart points={selected.points} form={form} />
            )}
            <details>
              <summary>About these numbers</summary>
              <p>
                These are self-reported approvals, not a personal forecast.
                Recent filing months can look faster because longer waits are
                still unfinished. All includes reports without a stated
                processing type; each group needs enough reports to appear.
                Reddit groups reports by filing month. USCIS shows the median
                for cases completed in that quarter:{" "}
                {form === "I-129"
                  ? "all I-129 classifications"
                  : form === "I-765"
                    ? "all I-765 All other cases"
                    : q.data.officialDescription}
                .
              </p>
            </details>
            <details>
              <summary>Data</summary>
              <div
                className="table-wrap reddit-table"
                tabIndex={0}
                role="region"
                aria-label="Reddit reported wait data"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Filing month</th>
                      <th>Approved reports</th>
                      <th>Median (months)</th>
                      <th>10% finished within (months)</th>
                      <th>90% finished within (months)</th>
                      <th>USCIS quarter</th>
                      <th>
                        USCIS median, cases completed that quarter (months)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.points.map((p, i) => (
                      <tr key={i}>
                        <td>{month(p.filedMonth)}</td>
                        <td>{display(p.approvedReports)}</td>
                        <td>{months(p.p50Days)}</td>
                        <td>{months(p.p10Days)}</td>
                        <td>{months(p.p90Days)}</td>
                        <td>{quarter(p.quarterStart)}</td>
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
  const laterMonths =
    !!last && q.data?.months.some((p) => p.month != null && p.month > last)
  const activity =
    q.data?.months
      .filter((p) => p.month)
      .map((p) => ({
        x: day(p.month!),
        first: p.h1bPosts,
        second: p.lotteryPosts,
      })) ?? []
  const lca =
    q.data?.months
      .filter((p) => p.month)
      .map((p) => ({
        x: day(p.month!),
        first: p.lcaCases,
        second: p.lcaCertified,
      })) ?? []
  return (
    <section className="panel insight-panel">
      <h1>H-1B talk vs LCA filings</h1>
      <p className="muted">
        H-1B case and lottery posts · policy news counted separately
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
                title="Reddit posts"
                first="H-1B cases"
                second="Lottery"
                from={q.data.from}
                through={q.data.through}
              />
              <ActivityChart
                rows={lca}
                title="LCA receipts"
                first="Received"
                second="Certified, including later withdrawn"
                from={q.data.from}
                through={q.data.through}
                latest={last}
              />
              {last && (
                <p className="muted">
                  Latest LCA month ({month(last)}) may be incomplete
                  {laterMonths ? "; later months not yet published." : "."}
                </p>
              )}
              <p className="muted">Missing months show as gaps.</p>
            </>
          )}
          {q.data.months.length === 0 ? (
            <p>Nothing to show yet.</p>
          ) : (
            <details>
              <summary>Monthly data</summary>
              <div
                className="table-wrap reddit-table"
                tabIndex={0}
                role="region"
                aria-label="H-1B activity and LCA monthly data"
              >
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
                          {month(p.month)}
                          {partialMonth(p.month, q.data!.from, q.data!.through)
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
          <details>
            <summary>About these numbers</summary>
            <p>
              LCAs are not people, petitions or lottery odds. Counts reflect
              changes in community size and which subreddits and archives are
              covered, not just interest or demand. Observed dates don't
              guarantee complete or successful data collection. Partial months
              are omitted from the charts but kept in the table.
            </p>
          </details>
        </>
      )}
    </section>
  )
}
export function RedditDiscussionPanel({
  points,
  hue,
}: {
  points: BulletinPoint[]
  hue: string
}) {
  const q = useQuery(redditDiscussionQuery())
  const rows =
    q.data?.months.filter((p) => p.topic === "employment_green_card") ?? []
  return (
    <section className="panel">
      <h2>Reddit discussion</h2>
      <p className="muted">
        Employment green card posts · all categories and countries
      </p>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <>
          <Coverage from={q.data.from} through={q.data.through} />
          {rows.some((p) => p.month) && (
            <ActivityChart
              bars
              title="Reddit posts"
              first="Employment green card posts"
              hue={hue}
              from={q.data.from}
              through={q.data.through}
              points={points}
              rows={rows
                .filter((p) => p.month)
                .map((p) => ({
                  x: day(p.month!),
                  first: p.posts,
                  second: null,
                }))}
            />
          )}
          {rows.length === 0 ? (
            <p>Nothing to show yet.</p>
          ) : (
            <details>
              <summary>Monthly data</summary>
              <div
                className="table-wrap reddit-table"
                tabIndex={0}
                role="region"
                aria-label="Reddit discussion and cutoff monthly data"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Posts</th>
                      <th>Comments</th>
                      <th>Cutoff</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice()
                      .reverse()
                      .map((p, i) => {
                        const official = points.find((o) => o.month === p.month)
                        return (
                          <tr key={i}>
                            <td>
                              {month(p.month)}
                              {partialMonth(
                                p.month,
                                q.data!.from,
                                q.data!.through
                              )
                                ? " · partial"
                                : ""}
                            </td>
                            <td>{display(p.posts)}</td>
                            <td>{display(p.comments)}</td>
                            <td>
                              {official?.status === "date"
                                ? fullDate(official.cutoff)
                                : official?.status === "current"
                                  ? "Current"
                                  : official?.status === "unavailable"
                                    ? "Unavailable"
                                    : "—"}
                            </td>
                            <td>{monthChange(movement(points, p.month))}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <details>
            <summary>About these numbers</summary>
            <p>
              Counts include general visa bulletin discussion but exclude posts
              classified as adjustment of status. They aren't specific to the
              selected category or country. Community size, subreddit coverage
              and archive coverage change over time, so counts don't just
              reflect interest or demand. Observed dates don't guarantee
              complete or successful data collection. Partial months are omitted
              from the chart but kept in the table.
            </p>
          </details>
        </>
      )}
    </section>
  )
}
