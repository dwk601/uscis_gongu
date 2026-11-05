import { queryOptions } from "@tanstack/react-query"

import { pb } from "./pb"

type Period = { fiscalYear: number | null; quarter: number | null }
export type FormSummary = {
  form: string
  name: string
  featured: boolean
  defaultSeries: string
  latestPeriod: Period
}
export type OfficialPoint = Period & {
  quarterStart: string | null
  received: number | null
  approved: number | null
  denied: number | null
  completed: number | null
  pending: number | null
  processingMonths: number | null
}
export type OfficialSeries = {
  id: string
  label: string
  category: string | null
  description: string
  points: OfficialPoint[]
  sourceFiles: string[]
}
export type FormDetail = {
  form: string
  name: string
  official: OfficialSeries[]
}
export type CommunityPoint = {
  filingYear: number | null
  sampleSize: number | null
  completed: number | null
  pending: number | null
  pendingShare: number | null
  p10: number | null
  p50: number | null
  p90: number | null
}
export type CommunitySeries = {
  source: string
  stage: string
  visaType: string | null
  meaning: string
  points: CommunityPoint[]
}
export type Bulletin = {
  categories: { code: string }[]
  category: string
  chart: string
  series: {
    country: string
    label: string | null
    points: {
      month: string | null
      cutoff: string | null
      status: "date" | "current" | "unavailable"
    }[]
  }[]
}

const staleTime = 60 * 60 * 1000
export const retry = (count: number, error: Error) => {
  const status =
    "status" in error && typeof error.status === "number" ? error.status : 0
  return !(status >= 400 && status < 500) && count < 3
}

export const formsQuery = () =>
  queryOptions({
    queryKey: ["uscis", "forms"],
    staleTime,
    retry,
    queryFn: ({ signal }) =>
      pb.send<{ forms: FormSummary[] }>("/api/x/uscis/forms", { signal }),
  })
export const formQuery = (form: string) =>
  queryOptions({
    queryKey: ["uscis", "forms", form],
    staleTime,
    retry,
    queryFn: ({ signal }) =>
      pb.send<FormDetail>(`/api/x/uscis/forms/${encodeURIComponent(form)}`, {
        signal,
      }),
  })
export const communityQuery = (form: string) =>
  queryOptions({
    queryKey: ["uscis", "community", form],
    staleTime,
    retry,
    queryFn: ({ signal }) =>
      pb.send<{ form: string; series: CommunitySeries[] }>(
        `/api/x/uscis/forms/${encodeURIComponent(form)}/community`,
        { signal }
      ),
  })
export const bulletinQuery = (category: string, chart: string) =>
  queryOptions({
    queryKey: ["uscis", "bulletin", category, chart],
    staleTime,
    retry,
    queryFn: ({ signal }) =>
      pb.send<Bulletin>("/api/x/uscis/bulletin", {
        signal,
        query: { category, chart },
      }),
  })
