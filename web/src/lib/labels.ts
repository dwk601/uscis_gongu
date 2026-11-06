export const categoryLabels: Record<string, string> = {
  F1: "Unmarried children (21 or older) of U.S. citizens · F1",
  F2A: "Spouses and unmarried children (under 21) of green card holders · F2A",
  F2B: "Unmarried children (21 or older) of green card holders · F2B",
  F3: "Married children of U.S. citizens · F3",
  F4: "Siblings of adult U.S. citizens (21 or older) · F4",
  EB1: "Priority workers: extraordinary ability, researchers & executives · EB-1",
  EB2: "Advanced degrees or exceptional ability · EB-2",
  EB3: "Skilled workers & professionals · EB-3",
  "EB3-OW": "Other workers (unskilled) · EB-3",
  EB4: "Special immigrants · EB-4",
  "EB4-RELIGIOUS": "Certain religious workers · EB-4",
  "EB5-UNRESERVED": "Investors — Unreserved · EB-5",
  "EB5-SET-ASIDE-RURAL": "Investors — Rural areas (reserved) · EB-5",
  "EB5-SET-ASIDE-HIGH-UNEMPLOYMENT":
    "Investors — High-unemployment areas (reserved) · EB-5",
  "EB5-SET-ASIDE-INFRASTRUCTURE":
    "Investors — Infrastructure (reserved) · EB-5",
  "EB5-NON-RC":
    "Investors — Non-regional center (C5/T5) · EB-5 · Older bulletins, Oct 2021–Apr 2022",
  "EB5-RC":
    "Investors — Regional center (I5/R5) · EB-5 · Older bulletins, Oct 2021–Apr 2022",
  "EB5-UNRESERVED-RC":
    "Investors — Unreserved, regional center (I5/R5) · EB-5 · Older bulletins, May 2022 only",
}
export const countryLabels: Record<string, string> = {
  ALL: "All other countries",
  CHINA: "China (mainland-born)",
  INDIA: "India",
  MEXICO: "Mexico",
  PHILIPPINES: "Philippines",
  "EL SALVADOR GUATEMALA HONDURAS": "El Salvador / Guatemala / Honduras",
}
export const redditCaseLabels: Record<string, string> = {
  opt: "OPT",
  stem_opt: "STEM OPT",
  h1b: "H-1B",
  h1b_change_of_status: "H-1B change of status",
  h1b_transfer: "H-1B transfer",
  h1b_extension: "H-1B extension",
  i140: "I-140",
}
const visaLabels: Record<string, string> = {
  K1: "Fiancé(e) visa (K-1)",
  "IR-1/CR-1": "Spouse immigrant visa (IR-1/CR-1)",
  K3: "Spouse visa (K-3)",
  "F-1": "Came on F-1",
  Other: "Other routes",
}
export const visaLabel = (visaType: string, form: string) =>
  visaType === "F-1" && form === "I-765"
    ? "Came on F-1 · not OPT data"
    : (visaLabels[visaType] ?? visaType)
export const formLabel = (
  code: string,
  forms?: { form: string; name: string }[]
) => {
  const name = forms?.find((form) => form.form === code)?.name
  return name ? `${name} · ${code}` : code
}
export const categoryLabel = (code: string) => categoryLabels[code] ?? code
export const countryLabel = (code: string) => countryLabels[code] ?? code
