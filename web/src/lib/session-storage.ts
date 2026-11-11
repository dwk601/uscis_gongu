// Browsers throw when session storage is denied, even on the sessionStorage
// property itself. Reads then find nothing remembered, and writes are dropped.

export function getSessionItem(key: string) {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function setSessionItem(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Without storage, the value is simply not remembered.
  }
}

export function removeSessionItem(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Without storage, there is nothing remembered to remove.
  }
}
