import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter"

export default class GuardReporter implements Reporter {
  private totals = {
    analytics: 0,
    nonGET: 0,
    unmockedAPI: 0,
    fulfilledMutations: 0,
    prohibitedForwards: 0,
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    const output = result.stdout.map((chunk) => chunk.toString()).join("")
    for (const match of output.matchAll(/Network guard: (\{[^\n]+\})/g)) {
      const counts = JSON.parse(match[1]) as typeof this.totals
      for (const key of Object.keys(
        this.totals
      ) as (keyof typeof this.totals)[])
        this.totals[key] += counts[key]
    }
  }

  onEnd() {
    console.log(`Network guard totals: ${JSON.stringify(this.totals)}`)
  }
}
