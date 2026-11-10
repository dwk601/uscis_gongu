export const journeys = [
  {
    id: "students",
    name: "Students",
    forms: [
      {
        form: "I-765",
        label: "OPT / STEM OPT work permit",
        preferredSeriesLabel: "All other cases",
      },
      { form: "I-539", label: "Change to student status / F-1 reinstatement" },
    ],
  },
  {
    id: "workers",
    name: "Workers",
    forms: [
      {
        form: "I-129",
        label: "Employer petition for temporary work, incl. H‑1B",
      },
      { form: "I-140", label: "Employment-based green card petition" },
      {
        form: "I-485",
        label: "Employment-based green card inside the U.S.",
        preferredSeriesLabel: "Employment",
      },
      {
        form: "I-765",
        label: "Work permit while green card is pending",
        preferredSeriesLabel: "Adjustment of status",
      },
      { form: "I-539", label: "Extend or change dependent status" },
      {
        form: "I-131",
        label: "Advance parole while green card is pending",
        preferredSeriesLabel: "Advance parole (inside U.S.)",
      },
    ],
  },
  {
    id: "family",
    name: "Family",
    forms: [
      {
        form: "I-130",
        label: "Petition for a relative",
        preferredSeriesLabel: "Immediate relatives",
      },
      { form: "I-129F", label: "Fiancé(e) / K-3 spouse petition" },
      {
        form: "I-485",
        label: "Family-based green card inside the U.S.",
        preferredSeriesLabel: "Family",
      },
      {
        form: "I-765",
        label: "Work permit while green card is pending",
        preferredSeriesLabel: "Adjustment of status",
      },
      {
        form: "I-131",
        label: "Advance parole while green card is pending",
        preferredSeriesLabel: "Advance parole (inside U.S.)",
      },
      { form: "I-751", label: "Remove marriage-based conditions" },
    ],
  },
  {
    id: "residents",
    name: "Green card holders",
    forms: [
      { form: "I-90", label: "Renew or replace a green card" },
      { form: "I-751", label: "Remove marriage-based conditions" },
      {
        form: "N-400",
        label: "Apply for citizenship",
        preferredSeriesLabel: "Application for Naturalization",
      },
      {
        form: "I-131",
        label: "Reentry permit",
        preferredSeriesLabel: "Travel & parole documents",
      },
    ],
  },
  {
    id: "investors",
    name: "Investors",
    forms: [
      {
        form: "I-526",
        label: "Standalone investor petition",
        preferredSeriesLabel: "Immigrant Petition by Standalone Investor",
      },
      { form: "I-526E", label: "Regional-center investor petition" },
      { form: "I-829", label: "Remove investor conditions" },
      {
        form: "I-485",
        label: "Employment-based green card inside the U.S.",
        preferredSeriesLabel: "Employment",
      },
      {
        form: "I-765",
        label: "Work permit while green card is pending",
        preferredSeriesLabel: "Adjustment of status",
      },
      {
        form: "I-131",
        label: "Advance parole while green card is pending",
        preferredSeriesLabel: "Advance parole (inside U.S.)",
      },
    ],
  },
  {
    id: "other",
    name: "Other",
    forms: [
      { form: "I-360", label: "Special immigrant, widow(er) or VAWA petition" },
      { form: "I-821D", label: "DACA" },
      { form: "I-601A", label: "Provisional unlawful presence waiver" },
      {
        form: "I-765",
        label: "DACA work permit",
        preferredSeriesLabel: "DACA",
      },
    ],
  },
] as const
export type JourneyId = (typeof journeys)[number]["id"] | "all"
export function isJourney(value: unknown): value is JourneyId {
  return value === "all" || journeys.some((j) => j.id === value)
}
export function journeyFor(id: JourneyId) {
  return journeys.find((j) => j.id === id)
}
export function availableJourneyForms(
  id: JourneyId,
  forms: { form: string }[] = []
) {
  return (
    journeyFor(id)?.forms.filter((choice) =>
      forms.some((form) => form.form === choice.form)
    ) ?? []
  )
}
export function inferJourney(form: string): JourneyId {
  const matches = journeys.filter((j) => j.forms.some((f) => f.form === form))
  return matches.length === 1 ? matches[0].id : "all"
}
