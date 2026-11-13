import type { RecordModel } from "pocketbase"
import { journeys } from "./journeys"

const generalLabels: Record<string, string> = {
  "I-765": "Work permit",
  "I-539": "Extend or change nonimmigrant status",
  "I-485": "Apply for a green card inside the U.S.",
  "I-131": "Travel or parole document",
}

export const seekingOptions = [
  ...Array.from(
    new Map(
      journeys.flatMap((journey) =>
        journey.forms.map(({ form, label }) => [
          form,
          { value: form, label: `${form} · ${generalLabels[form] ?? label}` },
        ])
      )
    ).values()
  ),
  { value: "none", label: "Nothing right now (N/A)" },
]

export const statusOptions = [
  { value: "citizen", label: "U.S. citizen" },
  { value: "permanent_resident", label: "Permanent resident (green card)" },
  { value: "conditional_resident", label: "Conditional permanent resident" },
  { value: "pending_green_card", label: "Green card application pending" },
  { value: "work_visa", label: "Work visa (H-1B, L-1, O-1…)" },
  { value: "student", label: "Student visa (F-1, M-1, J-1)" },
  { value: "dependent", label: "Dependent visa (H-4, F-2, L-2…)" },
  { value: "visitor", label: "Visitor" },
  { value: "humanitarian", label: "Asylum, refugee or parole" },
  { value: "daca_tps", label: "DACA or TPS" },
  { value: "outside_us", label: "Outside the U.S." },
  { value: "other", label: "Other" },
  { value: "none", label: "None / not applicable" },
]

const countryCodes = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/)
const regionNames = new Intl.DisplayNames(["en"], { type: "region" })

export const countryOptions = [
  { value: "none", label: "Prefer not to say / N/A" },
  ...countryCodes
    .map((value) => ({ value, label: regionNames.of(value) ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label, "en")),
]

export type ProfileAnswers = {
  seeking: string[]
  status: string
  country: string
}

export function profileAnswers(record: RecordModel): ProfileAnswers {
  return {
    seeking: Array.isArray(record.seeking)
      ? record.seeking.filter((value: unknown) =>
          seekingOptions.some((option) => option.value === value)
        )
      : [],
    status: statusOptions.some((option) => option.value === record.status)
      ? String(record.status)
      : "",
    country: countryOptions.some((option) => option.value === record.country)
      ? String(record.country)
      : "",
  }
}

export function profileComplete(record: RecordModel | null | undefined) {
  if (!record) return false
  const { seeking, status, country } = profileAnswers(record)
  return (
    seeking.length > 0 &&
    seeking.length === record.seeking.length &&
    (!seeking.includes("none") || seeking.length === 1) &&
    !!status &&
    !!country
  )
}
