import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
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

const revealSize = (block: AgentBlock) =>
  block.type === "paragraph" ? block.text.length : 1

// The first `shown` units of the answer, with a partly typed paragraph.
function revealed(blocks: AgentBlock[], shown: number) {
  const visible: AgentBlock[] = []
  for (const [index, block] of blocks.entries()) {
    const start = blocks.slice(0, index).reduce((n, b) => n + revealSize(b), 0)
    if (start >= shown) break
    visible.push(
      block.type === "paragraph"
        ? { ...block, text: block.text.slice(0, Math.ceil(shown - start)) }
        : block
    )
  }
  return visible
}

// The server validates the whole answer before sending it, so the text is
// typed out here: paragraphs count their characters, other blocks count one.
function useReveal(blocks: AgentBlock[]) {
  const total = blocks.reduce((n, block) => n + revealSize(block), 0)
  const [shown, setShown] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? total : 0
  )
  useEffect(() => {
    const perSecond = Math.max(240, total / 1.5)
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(total, ((now - start) / 1000) * perSecond)
      setShown((current) => Math.max(current, next))
      if (next < total) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [total])
  return { visible: revealed(blocks, shown), done: shown >= total }
}

export function AgentAnswer({ answer }: { answer: AgentResponse }) {
  const { visible, done } = useReveal(answer.blocks)
  const sources = answer.sources.filter(
    (source) =>
      source.href.startsWith("/") &&
      !source.href.startsWith("//") &&
      !/[\\\s]/.test(source.href)
  )
  return (
    <div className="agent-answer" aria-busy={!done}>
      {visible.map((block, index) => (
        <AnswerBlock key={index} block={block} sources={answer.sources} />
      ))}
      {done && sources.length > 0 && (
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
