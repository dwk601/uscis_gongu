import type { OfficialPoint } from "./api"

/** The latest reported positive median, not a personalized prediction. */
export function latestMedian(
  points: OfficialPoint[]
): OfficialPoint | undefined {
  return points
    .filter(
      (point) =>
        point.processingMonths != null &&
        point.processingMonths > 0 &&
        point.fiscalYear != null &&
        point.quarter != null
    )
    .sort((a, b) => b.fiscalYear! - a.fiscalYear! || b.quarter! - a.quarter!)[0]
}

export function estimateDate(filed: string, months: number): Date | undefined {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(filed) ||
    !Number.isFinite(months) ||
    months <= 0
  )
    return undefined
  const date = new Date(`${filed}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== filed)
    return undefined
  return new Date(date.getTime() + months * 30.44 * 24 * 60 * 60 * 1000)
}
