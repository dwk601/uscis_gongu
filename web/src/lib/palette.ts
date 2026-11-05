const hues = [
  "#F2703D",
  "#C7B6EC",
  "#D3E39A",
  "#2E4B36",
  "#9EC5F0",
  "#F2A5B7",
  "#F3D35B",
]
const featured = [
  "I-485",
  "I-130",
  "I-765",
  "I-131",
  "N-400",
  "I-140",
  "I-129F",
]
export function categoryHue(category: string) {
  const categoryHues = [
    "#D3E39A",
    "#C7B6EC",
    "#9EC5F0",
    "#F2A5B7",
    "#F3D35B",
    "#F2703D",
  ]
  if (category === "EB2") return categoryHues[0]
  return categoryHues[
    [...category].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
      categoryHues.length
  ]
}

const chartColors: Record<string, [string, string]> = {
  "#F2703D": ["#C24E1C", "#F2703D"],
  "#C7B6EC": ["#7653A5", "#C7B6EC"],
  "#D3E39A": ["#5C7422", "#D3E39A"],
  "#2E4B36": ["#2E4B36", "#9AC2A1"],
  "#9EC5F0": ["#316DA8", "#9EC5F0"],
  "#F2A5B7": ["#A94161", "#F2A5B7"],
  "#F3D35B": ["#846C09", "#F3D35B"],
}

export function chartHue(hue: string) {
  return chartColors[hue.toUpperCase()] ?? ["#555555", "#CCCCCC"]
}

export function formInk(form: string) {
  return formHue(form) === "#2E4B36" ? "#FFFFFF" : "#171717"
}

export function formHue(form: string) {
  const index = featured.indexOf(form)
  return hues[
    index < 0
      ? [...form].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
        hues.length
      : index
  ]
}
