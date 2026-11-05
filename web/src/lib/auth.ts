import { useSyncExternalStore } from "react"
import { pb } from "./pb"

let currentUser = pb.authStore.isValid ? pb.authStore.record : null
pb.authStore.onChange((_token, record) => {
  currentUser = pb.authStore.isValid ? record : null
})

export const authReady = pb.authStore.token
  ? pb
      .collection("users")
      .authRefresh()
      .catch(() => pb.authStore.clear())
  : Promise.resolve()

export function useAuth() {
  return useSyncExternalStore(
    (notify) => pb.authStore.onChange(notify),
    () => currentUser,
    () => null
  )
}

export function errorMessage(error: unknown) {
  const e = error as {
    status?: number
    response?: { message?: string; data?: Record<string, { message?: string }> }
  }
  if (e.status === 429)
    return "Too many requests. Please wait a minute and try again."
  const fields = Object.values(e.response?.data ?? {})
    .map((v) => v.message)
    .filter(Boolean)
  return (
    fields.join(" ") ||
    e.response?.message ||
    "Something went wrong. Please try again."
  )
}
