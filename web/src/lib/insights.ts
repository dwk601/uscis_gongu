import { queryOptions } from "@tanstack/react-query"
import { pb } from "./pb"
import { retry } from "./api"

export type CurvePoint = {
  day: number
  waiting: number
  low: number | null
  high: number | null
  atRisk: number
}
export type VisaInsight = {
  status: "ready" | "insufficient_data"
  historical: boolean
  source: string
  from: string
  to: string
  excluded: number
  groups: {
    office: string
    included: number
    decisions: number
    censored: number
    medianDays: number | null
    p90Days: number | null
    curve: CurvePoint[]
  }[]
}
export type Box = {
  cases: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}
export type PayCatalog = {
  years: {
    year: number
    from: string
    to: string
    titles: { key: string; title: string; cases: number }[]
  }[]
}
export type Pay = {
  year: number
  key: string
  title: string
  all: Box
  states: (Box & { state: string })[]
}
export type Employers = {
  years: number[]
  year: number | null
  employers: {
    name: string
    initialApprovals: number
    initialDenials: number
    continuingApprovals: number
  }[]
}
export type Topic = "sevis" | "cpt" | "policy"
export type StudentPosts = {
  from: string
  to: string
  weeks: ({
    week: string
    covered: boolean
    all: number | null
    z: Record<Topic, number | null>
  } & Record<Topic, number | null>)[]
  topics: Record<Topic, { posts: number }>
}

function insightQuery<T>(
  endpoint: string,
  query?: Record<string, string | number>
) {
  return queryOptions({
    queryKey: ["uscis", "insights", endpoint, query],
    staleTime: 60 * 60 * 1000,
    retry,
    queryFn: ({ signal }) =>
      pb.send<T>(`/api/x/uscis/insights/${endpoint}`, { signal, query }),
  })
}
export const visaInsightQuery = () => insightQuery<VisaInsight>("visa-221g")
export const payCatalogQuery = () => insightQuery<PayCatalog>("h1b-pay")
export const payQuery = (year: number, title: string) =>
  insightQuery<Pay>("h1b-pay", { year, title })
export const employersQuery = (year?: number) =>
  insightQuery<Employers>("h1b-employers", year ? { year } : undefined)
export const studentPostsQuery = () =>
  insightQuery<StudentPosts>("student-posts")
