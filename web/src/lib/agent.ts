import { ClientResponseError } from "pocketbase"
import { errorMessage } from "./auth"
import { pb } from "./pb"

export type AgentBlock =
  | { type: "paragraph"; text: string }
  | {
      type: "stat"
      label: string
      value: number | null
      unit: "months" | "cases"
      period: string | null
      sourceId: string
    }
  | {
      type: "table"
      columns: { key: string; label: string }[]
      rows: Record<string, string | number | null>[]
      sourceId: string
    }
  | {
      type: "date_estimate"
      form: string
      series: string
      filingDate: string
      medianMonths: number
      estimatedDate: string
      period: string
      sourceId: string
    }
  | {
      type: "bulletin_cutoff"
      category: string
      country: string
      chart: string
      month: string | null
      status: "date" | "current" | "unavailable"
      cutoff: string | null
      sourceId: string
    }

export type AgentBudget = {
  limit: number
  remaining: number
  questionLimit: number
  resetsAt: string
}

export type AgentResponse = {
  kind: "answer" | "refusal" | "clarification" | "no_data"
  blocks: AgentBlock[]
  sources: { id: string; label: string; href: string; period: string | null }[]
  budget: AgentBudget
}

// Admitted questions stream Server-Sent Events: "status" progress messages,
// then one "answer" or "error". Rejections before admission are plain JSON.
export async function askAgent(
  question: string,
  signal: AbortSignal,
  onStatus: (message: string) => void
) {
  const url = pb.buildURL("/api/x/agent/ask")
  const fail = (status: number, response: unknown) =>
    new ClientResponseError({ url, status, response })
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({ question }),
    signal,
  })
  if (!res.ok || !res.body)
    throw fail(res.status, await res.json().catch(() => ({})))
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) throw fail(0, {})
    buffer += value
    let end
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const [, name, data] =
        /^event: (\w+)\ndata: (.*)$/s.exec(buffer.slice(0, end)) ?? []
      buffer = buffer.slice(end + 2)
      if (!name) continue
      const payload = JSON.parse(data)
      if (name === "status") onStatus(payload.message)
      if (name === "answer") return payload as AgentResponse
      if (name === "error") throw fail(payload.status, payload)
    }
  }
}

export function agentError(error: unknown) {
  const e = error as {
    status?: number
    response?: {
      message?: string
      data?: {
        reason?: { code?: string }
        remaining?: number
        resetsAt?: string
      }
    }
  }
  if (e.status === 401) return { sessionEnded: true as const }
  const data = e.response?.data
  if (e.status === 429 && data?.reason?.code === "daily_budget_exhausted")
    return {
      message: "You have used today's Ask gongu budget.",
      budget:
        typeof data.remaining === "number" && typeof data.resetsAt === "string"
          ? { remaining: data.remaining, resetsAt: data.resetsAt }
          : undefined,
      sessionEnded: false as const,
    }
  return {
    message:
      e.status === 429 && data?.reason?.code === "busy"
        ? e.response?.message ||
          "Ask gongu is busy. Please try again in a moment."
        : errorMessage(error),
    sessionEnded: false as const,
    budget: undefined,
  }
}
