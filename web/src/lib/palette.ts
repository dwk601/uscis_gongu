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
