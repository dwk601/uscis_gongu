import { queryOptions } from "@tanstack/react-query"

import { retry, type FormSummary, type OfficialPoint } from "./api"
import { pb } from "./pb"

type Nullable<T> = T | null
export type CaseResponse = {
  forms: FormSummary[]
  form: string
  categoryLabel: string
  official: {
    description: Nullable<string>
    medianMonths: Nullable<number>
    period: Nullable<string>
    previousMedianMonths: Nullable<number>
    previousPeriod: Nullable<string>
    latestReportingPeriod: Nullable<string>
    trend: Nullable<string>
    asOfDate: Nullable<string>
    reason: Nullable<string>
    source: Nullable<string>
    population: Nullable<string>
  }
  trend: OfficialPoint[]
  community: Nullable<{
    filingYear: Nullable<number>
    p25Days: Nullable<number>
    p50Days: Nullable<number>
    p75Days: Nullable<number>
    eligibleCount: Nullable<number>
    completedCount: Nullable<number>
    censoredCount: Nullable<number>
    excludedCount: Nullable<number>
    visaTypes: Nullable<string[]>
    asOfDate: Nullable<string>
    refreshedAt: Nullable<string>
    reason: Nullable<string>
    p25Reason: Nullable<string>
    p75Reason: Nullable<string>
    source: Nullable<string>
    method: Nullable<string>
    population: Nullable<string>
  }>
  summary: { eligibleReports: number; years: number[] }
  freshness: {
    source: string
    latestStatus: Nullable<string>
    latestAttemptStartedAt: Nullable<string>
    latestAttemptFinishedAt: Nullable<string>
    lastSuccessAt: Nullable<string>
    lastDataAt: Nullable<string>
    lastDataStatus: Nullable<string>
    latestAttemptFailed: Nullable<boolean>
  }[]
}

export const caseQuery = (form: string, filingYear?: number) =>
  queryOptions({
    queryKey: ["uscis", "case", form, filingYear ?? null],
    staleTime: 60 * 60 * 1000,
    retry,
    queryFn: ({ signal }) =>
      pb.send<CaseResponse>("/api/x/uscis/case", {
        signal,
        query: filingYear === undefined ? { form } : { form, filingYear },
      }),
  })
