import { useSyncExternalStore } from "react"
import { pb } from "./pb"

let currentUser = pb.authStore.isValid ? pb.authStore.record : null
pb.authStore.onChange((_token, record) => {
  currentUser = pb.authStore.isValid ? record : null
})

async function refreshSession() {
  const token = pb.authStore.token
  if (!token) return
  try {
    await pb.collection("users").authRefresh()
  } catch (error) {
    const status = (error as { status?: number }).status
    if ([400, 401, 404].includes(status ?? 0) && pb.authStore.token === token)
      pb.authStore.clear()
  }
}

export const authReady = refreshSession()

export async function mutationErrorMessage(error: unknown) {
  const status = (error as { status?: number }).status
  const hadToken = !!pb.authStore.token
  if (hadToken && [400, 401, 403, 404].includes(status ?? 0))
    await refreshSession()
  if (hadToken && !pb.authStore.token)
    return "Your session ended. Please sign in again."
  return errorMessage(error)
}

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
