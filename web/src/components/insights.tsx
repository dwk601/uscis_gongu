import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Fragment } from "react"
import { useState } from "react"
import {
  employersQuery,
  payCatalogQuery,
  payQuery,
  studentPostsQuery,
  visaInsightQuery,
  type Box,
  type Topic,
} from "@/lib/insights"

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
    <p>Loading insights…</p>
  ) : error ? (
    <p className="error">
      Insights unavailable. <button onClick={retry}>Try again</button>
    </p>
  ) : null
}
function Visa() {
  const q = useQuery(visaInsightQuery())
  const [office, setOffice] = useState("All consulates")
  const group =
    q.data?.groups.find((g) => g.office === office) ?? q.data?.groups[0]
  const curve = group?.curve ?? []
  const max = Math.max(1, ...curve.map((p) => p.day))
  const x = (day: number) => 10 + (day / max) * 580
  const y = (value: number) => 10 + (1 - value) * 180
  const step = (values: { day: number; value: number }[]) =>
    values
      .map((p, i) => `${i ? `H ${x(p.day)} V` : `M ${x(p.day)}`} ${y(p.value)}`)
      .join(" ")
  const band = curve
    .slice(0, -1)
    .map((p, i) =>
      p.low == null || p.high == null
        ? ""
        : `M ${x(p.day)} ${y(p.high)} H ${x(curve[i + 1].day)} V ${y(p.low)} H ${x(p.day)} Z`
    )
    .join(" ")
  return (
    <section className="panel insight-panel">
      <h1>221(g) wait (older reports)</h1>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <>
          <div className="controls" role="group" aria-label="Consulate">
            {q.data.groups.map((g) => (
              <button
                className="chip"
                aria-pressed={group?.office === g.office}
                key={g.office}
                onClick={() => setOffice(g.office)}
              >
                {g.office}
              </button>
            ))}
          </div>
          {group ? (
            <>
              <h2>
                {group.medianDays == null
                  ? group.decisions < 30
                    ? "Not enough decisions yet"
                    : "Most are still waiting"
                  : `Typical wait: ${group.medianDays} days`}
              </h2>
              <p className="muted">
                Older self-reports ({q.data.from.slice(0, 4)}–
                {q.data.to.slice(0, 4)}) · not a current forecast
              </p>
              <p>Still waiting</p>
              <svg
                className="insight-chart"
                viewBox="0 0 600 200"
                role="img"
                aria-label="Share still waiting by days; details in data table"
              >
                <path d={band} fill="var(--focus)" opacity="0.2" />
                <path
                  d={step(curve.map((p) => ({ day: p.day, value: p.waiting })))}
                  fill="none"
                  stroke="var(--focus)"
                  strokeWidth="3"
                />
              </svg>
              <div className="insight-axis">
                <span>0 days</span>
                <span>{max} days</span>
              </div>
              <details>
                <summary>Data</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Days</th>
                        <th>Still waiting</th>
                        <th>Lower bound</th>
                        <th>Upper bound</th>
                        <th>At risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curve.map((p, i) => (
                        <tr key={i}>
                          <td>{p.day}</td>
                          <td>{Math.round(p.waiting * 100)}%</td>
                          <td>
                            {p.low == null
                              ? "—"
                              : `${Math.round(p.low * 100)}%`}
                          </td>
                          <td>
                            {p.high == null
                              ? "—"
                              : `${Math.round(p.high * 100)}%`}
                          </td>
                          <td>{p.atRisk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <details>
                <summary>About these numbers</summary>
                <p>
                  {group.decisions} finished reports · {group.censored} still
                  waiting · {q.data.excluded} excluded. The shaded band is a 95%
                  confidence interval. Source: {q.data.source}.
                </p>
              </details>
            </>
          ) : (
            <p>Not enough reports yet.</p>
          )}
        </>
      )}
    </section>
  )
}
const money = (n: number) => `$${Math.round(n).toLocaleString()}`
function BoxRow({ name, box, max }: { name: string; box: Box; max: number }) {
  const pos = (n: number) => (n / max) * 100
  return (
    <div className="box-row">
      <strong>{name}</strong>
      <svg
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${name}: middle 80% ${money(box.p10)} to ${money(box.p90)}, middle 50% ${money(box.p25)} to ${money(box.p75)}, median ${money(box.p50)}`}
      >
        <line
          x1={pos(box.p10)}
          x2={pos(box.p90)}
          y1="6"
          y2="6"
          stroke="currentColor"
          strokeWidth=".5"
        />
        <rect
          x={pos(box.p25)}
          y="2"
          width={pos(box.p75 - box.p25)}
          height="8"
          fill="var(--focus)"
        />
        <line
          x1={pos(box.p50)}
          x2={pos(box.p50)}
          y1="1"
          y2="11"
          stroke="var(--ground)"
          strokeWidth="1"
        />
      </svg>
      <span>
        {money(box.p50)} · {box.cases.toLocaleString()} cases
      </span>
    </div>
  )
}
function PayDetail({ year, title }: { year: number; title: string }) {
  const q = useQuery(payQuery(year, title))
  const max = Math.max(
    1,
    q.data?.all.p90 ?? 0,
    ...(q.data?.states.map((s) => s.p90) ?? [])
  )
  return (
    <>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <>
          <h2>Starting pay / year</h2>
          <p>Whiskers: middle 80% · box: middle 50% · line: median</p>
          <BoxRow name="All states" box={q.data.all} max={max} />
          {q.data.states.map((s) => (
            <BoxRow key={s.state} name={s.state} box={s} max={max} />
          ))}
        </>
      )}
    </>
  )
}
function Pay() {
  const q = useQuery(payCatalogQuery())
  const [year, setYear] = useState<number>()
  const [title, setTitle] = useState("")
  const [filter, setFilter] = useState("")
  const selectedYear =
    q.data?.years.find((y) => y.year === year) ?? q.data?.years[0]
  const titles = selectedYear?.titles ?? []
  const selected = titles.find((t) => t.key === title) ?? titles[0]
  return (
    <section className="panel insight-panel">
      <h1>H-1B offered pay</h1>
      <p>
        Offered pay is not actual earnings, and job title is not experience
        level.
      </p>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && !selected && <p>Nothing to show yet.</p>}
      {selectedYear && selected && (
        <>
          <div className="controls">
            <label>
              Year{" "}
              <select
                className="field"
                value={selectedYear.year}
                onChange={(e) => {
                  setYear(Number(e.target.value))
                  setTitle("")
                }}
              >
                {q.data?.years.map((y) => (
                  <option key={y.year}>{y.year}</option>
                ))}
              </select>
            </label>
            <label>
              Search job titles{" "}
              <input
                className="field"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <label>
              Job title{" "}
              <select
                className="field"
                value={selected?.key ?? ""}
                onChange={(e) => setTitle(e.target.value)}
              >
                {selected &&
                  !selected.title
                    .toLowerCase()
                    .includes(filter.toLowerCase()) && (
                    <option value={selected.key}>{selected.title}</option>
                  )}
                {titles
                  .filter((t) =>
                    t.title.toLowerCase().includes(filter.toLowerCase())
                  )
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {selected && (
            <PayDetail year={selectedYear.year} title={selected.key} />
          )}
          <details>
            <summary>About these numbers</summary>
            <p>
              Certified full-time H-1B LCA cases with annual wages, received{" "}
              {selectedYear.from}–{selectedYear.to}. One case per report; state
              rows have at least 30 cases.
            </p>
          </details>
        </>
      )}
    </section>
  )
}
function EmployerInsight() {
  const [year, setYear] = useState<number>()
  const catalog = useQuery(employersQuery())
  const q = useQuery({
    ...employersQuery(year),
    placeholderData: keepPreviousData,
  })
  const yearOptions = q.data ?? catalog.data
  const max = Math.max(
    1,
    ...(q.data?.employers.map((e) => e.initialApprovals) ?? [])
  )
  return (
    <section className="panel insight-panel">
      <h1>Employers with H-1B approvals</h1>
      <p>Past approvals don't mean an employer is hiring or sponsoring now.</p>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {yearOptions && yearOptions.years.length > 0 && (
        <label>
          Year{" "}
          <select
            className="field"
            value={year ?? yearOptions.year ?? ""}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      )}
      {q.isPlaceholderData && <p role="status">Loading employers…</p>}
      {q.data && (
        <div
          aria-busy={q.isPlaceholderData}
          className={q.isPlaceholderData ? "insight-loading" : undefined}
        >
          {q.data.employers.length === 0 ? (
            <p>Nothing to show yet.</p>
          ) : (
            <>
              <h2>Initial approvals</h2>
              <ol className="employer-list">
                {q.data.employers.map((e) => (
                  <li key={e.name}>
                    <strong>{e.name}</strong>
                    <div
                      className="employer-bar"
                      style={{ width: `${(e.initialApprovals / max) * 100}%` }}
                    />
                    <span>{e.initialApprovals.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  )
}
function Posts() {
  const q = useQuery(studentPostsQuery())
  const [topic, setTopic] = useState<Topic>("sevis")
  const weeks = q.data?.weeks ?? []
  const max = Math.max(1, ...weeks.map((w) => w[topic] ?? 0))
  return (
    <section className="panel insight-panel">
      <h1>What students post about</h1>
      <p>Weekly mentions in r/f1visa and r/stemopt. Topics can overlap.</p>
      <div className="controls" role="group" aria-label="Topic">
        {(["sevis", "cpt", "policy"] as const).map((t) => (
          <button
            className="chip"
            key={t}
            aria-pressed={topic === t}
            onClick={() => setTopic(t)}
          >
            {t === "policy" ? "Policy" : t.toUpperCase()}
          </button>
        ))}
      </div>
      <State
        loading={q.isLoading}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data &&
        (weeks.length === 0 ? (
          <p>Nothing to show yet.</p>
        ) : (
          <>
            <svg
              className="insight-chart"
              viewBox="0 0 600 180"
              role="img"
              aria-label="Weekly post counts; gaps indicate uncovered weeks, baseline marks indicate zero, and triangles mark more posts than usual"
            >
              {weeks.map((w, i) => {
                const count = w[topic]
                if (!w.covered || count == null) return null
                const x = (i / weeks.length) * 600
                const width = Math.max(1, 590 / weeks.length)
                const top =
                  165 - (count === 0 ? 0 : Math.max(7, (count / max) * 140))
                const spike = (w.z[topic] ?? -Infinity) >= 3
                return (
                  <Fragment key={w.week}>
                    {count === 0 ? (
                      <line
                        x1={x}
                        x2={x + width}
                        y1="165"
                        y2="165"
                        stroke="var(--ink)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <rect
                        x={x}
                        y={top}
                        width={width}
                        height={165 - top}
                        fill="var(--focus)"
                      />
                    )}
                    {spike && (
                      <path
                        d={`M ${x + width / 2} ${top - 4} l -10 -16 h 20 Z`}
                        fill="var(--ink)"
                      />
                    )}
                  </Fragment>
                )
              })}
            </svg>
            <p className="muted">
              Triangle: More posts than usual · baseline: zero posts
            </p>
            <details open>
              <summary>Weekly counts</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Posts</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.week}>
                        <td>{w.week}</td>
                        <td>{w.covered ? (w[topic] ?? "—") : "Not covered"}</td>
                        <td>
                          {(w.z[topic] ?? -Infinity) >= 3
                            ? "More posts than usual"
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details>
              <summary>About these numbers</summary>
              <p>
                Counts are mentions, not people. A week is covered only when
                both communities are covered. More posts than usual means at
                least three standard deviations above the previous 12 weeks.
              </p>
            </details>
          </>
        ))}
    </section>
  )
}
export function Insight({ id }: { id: string }) {
  if (id === "visa-221g") return <Visa />
  if (id === "h1b-pay") return <Pay />
  if (id === "h1b-employers") return <EmployerInsight />
  return <Posts />
}
