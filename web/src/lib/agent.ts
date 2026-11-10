import { errorMessage } from "./auth"
import { pb } from "./pb"

export type AgentBlock =
  | { type: "paragraph"; text: string }
  | {
      type: "stat"
      label: string
      value: number | null
      unit: "months" | "days" | "cases" | "percent" | null
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

export function askAgent(question: string, signal: AbortSignal) {
  return pb.send<AgentResponse>("/api/x/agent/ask", {
    method: "POST",
    body: { question },
    signal,
    requestKey: null,
  })
}

export function agentError(error: unknown) {
  const e = error as {
    status?: number
    response?: {
      data?: {
        reason?: { code?: string }
        remaining?: number
        resetsAt?: string
      }
    }
  }
  const data = e.response?.data
  if (e.status === 429 && data?.reason?.code === "daily_budget_exhausted")
    return {
      message: "You have used today's Ask gongu budget.",
      budget:
        typeof data.remaining === "number" && typeof data.resetsAt === "string"
          ? { remaining: data.remaining, resetsAt: data.resetsAt }
          : undefined,
      sessionEnded: false,
    }
  return {
    message:
      e.status === 401
        ? "Your session ended. Please sign in again."
        : errorMessage(error),
    sessionEnded: e.status === 401,
    budget: undefined,
  }
}
