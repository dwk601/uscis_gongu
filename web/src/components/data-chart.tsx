import { areaY, defineChart, lineY } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scaleUtc } from "@tanstack/charts/scales/time"
import type { CSSProperties } from "react"
import { chartHue } from "@/lib/palette"

export type ChartRow = {
  x: number
  label: string
  value: number | null
  low?: number | null
  high?: number | null
  other?: number | null
  status?: "date" | "current" | "unavailable"
  exact?: string
}
function StatusTimeline({ rows }: { rows: ChartRow[] }) {
  const first = rows[0]?.x ?? 0
  const last = rows.at(-1)?.x ?? first
  const position = (x: number) =>
    `${((x - first) / (last - first || 1)) * 100}%`
  return (
    <div
      className="status-timeline"
      aria-label="Bulletin status by month; details in the data table"
    >
      <div className="status-labels">
        <span>Current</span>
        <span>Unavailable</span>
      </div>
      <div
        className="status-track"
        role="img"
        aria-label="Current and unavailable bulletin months"
      >
        {rows
          .filter(
            (row) => row.status === "current" || row.status === "unavailable"
          )
          .map((row) => (
            <span
              key={row.x}
              className={`status-marker ${row.status}`}
              style={{ left: position(row.x) }}
              title={`${row.label}: ${row.status === "current" ? "Current" : "Unavailable"}`}
            />
          ))}
      </div>
    </div>
  )
}

export default function DataChart({
  title,
  rows,
  hue = "#F2703D",
  second,
  band,
  calendar,
  dateValues,
  extras = [],
  pending,
}: {
  title: string
  rows: ChartRow[]
  hue?: string
  second?: string
  band?: boolean
  calendar?: boolean
  dateValues?: boolean
  extras?: ChartRow[][]
  pending?: string
}) {
  const x = (row: ChartRow) => (calendar ? new Date(row.x) : row.x)
  const definition = defineChart({
    marks: [
      ...(band
        ? [
            areaY(rows, {
              x,
              y1: "low",
              y2: "high",
              fill: hue,
              fillOpacity: 0.18,
            }),
          ]
        : []),
      ...extras.map((extra) =>
        lineY(extra, {
          x,
          y: "value",
          stroke: "#999990",
          strokeWidth: 1,
          strokeOpacity: 0.6,
        })
      ),
      lineY(rows, {
        x,
        y: "value",
        stroke: "var(--chart-stroke)",
        strokeWidth: 2,
        points: true,
      }),
      ...(second
        ? [
            lineY(rows, {
              x,
              y: "other",
              stroke: "var(--ink)",
              strokeWidth: 2,
              strokeDasharray: "5 3",
            }),
          ]
        : []),
    ],
    scales: {
      x: { scale: calendar ? scaleUtc : scaleLinear },
      y: { scale: scaleLinear },
    },
    ...(dateValues ? { margin: { left: 72, right: 12 } } : {}),
  })
  const display = (value: number | null) =>
    value == null
      ? "—"
      : dateValues
        ? new Date(
            Date.UTC(Math.floor(value), Math.round((value % 1) * 12), 1)
          ).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })
        : Math.round(value * 10) / 10
  const [lightStroke, darkStroke] = chartHue(hue)
  return (
    <section
      className="panel chart-panel"
      style={
        {
          "--chart-light": lightStroke,
          "--chart-dark": darkStroke,
        } as CSSProperties
      }
    >
      <h2>{title}</h2>
      {second && (
        <div className="chart-legend">
          <span>
            <i style={{ background: "var(--chart-stroke)" }} />
            Received
          </span>
          <span>
            <i className="legend-ink" />
            {second}
          </span>
          {pending && <span>Pending: {pending}</span>}
        </div>
      )}
      {rows.some((row) => row.status && row.status !== "date") && (
        <StatusTimeline rows={rows} />
      )}
      {rows.some((row) => row.value != null) ? (
        <Chart
          definition={definition}
          ariaLabel={title}
          initialWidth={600}
          height={220}
        />
      ) : (
        <p className="muted">No data available.</p>
      )}
      <details>
        <summary>Data</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Value</th>
                {band && (
                  <>
                    <th>p10</th>
                    <th>p90</th>
                  </>
                )}
                {second && <th>{second}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.x}-${index}`}>
                  <td>{row.label}</td>
                  <td>
                    {row.status === "current"
                      ? "Current"
                      : row.status === "unavailable"
                        ? "Unavailable"
                        : (row.exact ?? display(row.value))}
                  </td>
                  {band && (
                    <>
                      <td>{row.low ?? "—"}</td>
                      <td>{row.high ?? "—"}</td>
                    </>
                  )}
                  {second && <td>{row.other ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
