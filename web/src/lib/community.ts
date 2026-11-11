import { pb } from "./pb"
import type { RecordModel } from "pocketbase"

export interface Post extends RecordModel {
  title: string
  body: string
  form: string
  author: string
  author_name: string
  created: string
  votes: number
  comments: number
}
export interface Comment extends RecordModel {
  post: string
  body: string
  author: string
  author_name: string
  created: string
}
export interface Vote extends RecordModel {
  post: string
  user: string
}
export const validForm = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z0-9-]{1,12}$/.test(value)
export function relativeTime(value: string) {
  const seconds = Math.max(
    0,
    (Date.now() - new Date(value.replace(" ", "T")).getTime()) / 1000
  )
  if (!Number.isFinite(seconds)) return ""
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ]
  const unit = units.find(([, size]) => seconds >= size)
  return unit
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        -Math.floor(seconds / unit[1]),
        unit[0]
      )
    : "just now"
}
export function listPosts(page: number, sort: string, form: string) {
  return pb.collection("post_feed").getList<Post>(page, 20, {
    skipTotal: true,
    sort: sort === "top" ? "-votes,-created" : "-created",
    filter: form ? pb.filter("form = {:form}", { form }) : "",
  })
}
export function listVotes() {
  return pb.collection("votes").getFullList<Vote>()
}
