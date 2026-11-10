import { Link } from "@tanstack/react-router"
import type { AgentBlock, AgentResponse } from "@/lib/agent"
import { formatMonths } from "@/lib/estimate"
import { categoryLabel, countryLabel } from "@/lib/labels"
import {
  BigNumber,
  BulletinCutoffCard,
  EstimateCard,
} from "@/components/insight-cards"

function dateLabel(value: string, monthOnly = false) {
  const date = new Date(
    `${value.length === 7 ? `${value}-01` : value}T00:00:00Z`
  )
  return date.toLocaleDateString("en-US", {
    month: "short",
    ...(monthOnly ? {} : { day: "numeric" }),
    year: "numeric",
    timeZone: "UTC",
  })
}

function AnswerBlock({
  block,
  sources,
}: {
  block: AgentBlock
  sources: AgentResponse["sources"]
}) {
  switch (block.type) {
    case "paragraph":
      return <p className="agent-paragraph">{block.text}</p>
    case "stat":
      return (
        <section className="panel agent-stat">
          <h3>{block.label}</h3>
          <BigNumber>
            {block.value == null ? "Unavailable" : block.value.toLocaleString()}
            {block.value != null && ` ${block.unit}`}
          </BigNumber>
          {block.period && <small>{block.period}</small>}
        </section>
      )
    case "date_estimate":
      return (
        <EstimateCard
          form={block.form}
          title={`Estimated around ${dateLabel(block.estimatedDate, true)}`}
          estimatedDate={new Date(`${block.estimatedDate}T00:00:00Z`)}
        >
          <small>
            Typical wait {formatMonths(block.medianMonths)} mo · {block.period}
            <br />
            {block.form} · {block.series}
            <br />
            Filed {dateLabel(block.filingDate)}
          </small>
        </EstimateCard>
      )
    case "bulletin_cutoff":
      return (
        <BulletinCutoffCard
          category={block.category}
          title={
            block.status === "current"
              ? "Current"
              : block.status === "date" && block.cutoff
                ? dateLabel(block.cutoff)
                : "Unavailable"
          }
        >
          <p>{categoryLabel(block.category)}</p>
          <p>
            {block.chart === "final_action"
              ? "Approval cutoff"
              : "Filing cutoff"}
          </p>
          <small>
            {block.month && `Bulletin ${dateLabel(block.month, true)} · `}
            {countryLabel(block.country)}
          </small>
        </BulletinCutoffCard>
      )
    case "table":
      return (
        <div className="table-wrap" tabIndex={0}>
          <table
            aria-label={
              sources.find((source) => source.id === block.sourceId)?.label ??
              "Answer data"
            }
          >
            <thead>
              <tr>
                {block.columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index}>
                  {block.columns.map((column) => (
                    <td key={column.key}>{row[column.key] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function AgentAnswer({ answer }: { answer: AgentResponse }) {
  const sources = answer.sources.filter(
    (source) =>
      source.href.startsWith("/") &&
      !source.href.startsWith("//") &&
      !/[\\\s]/.test(source.href)
  )
  return (
    <div className="agent-answer">
      {answer.blocks.map((block, index) => (
        <AnswerBlock key={index} block={block} sources={answer.sources} />
      ))}
      {sources.length > 0 && (
        <nav className="agent-sources" aria-label="Answer sources">
          <h3>Sources</h3>
          {sources.map((source) => (
            <Link key={source.id} to={source.href}>
              {source.label}
              {source.period && ` · ${source.period}`}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
