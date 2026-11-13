import { MessageCircle } from "lucide-react"
import { useEffect, useState, type RefObject } from "react"
import "./agent-launcher.css"

export function AgentLauncher({
  launcher,
  panel,
  open,
  onIntent,
  onOpenChange,
}: {
  launcher: RefObject<HTMLButtonElement | null>
  panel: HTMLElement | null
  open: boolean
  onIntent: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [tooltipDismissed, setTooltipDismissed] = useState(false)

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      const button = launcher.current
      if (
        open ||
        button?.matches(":focus-visible") ||
        (window.matchMedia("(hover: hover)").matches &&
          button?.parentElement?.matches(":hover"))
      )
        setTooltipDismissed(true)
      if (open && !panel?.contains(event.target as Node)) {
        event.preventDefault()
        onOpenChange(false)
        button?.focus({ preventScroll: true })
      }
    }
    document.addEventListener("keydown", escape, true)
    return () => document.removeEventListener("keydown", escape, true)
  }, [launcher, panel, open, onOpenChange])

  return (
    <button
      ref={launcher}
      className="chip agent-launcher"
      type="button"
      aria-label="Ask gongu"
      aria-expanded={open}
      aria-controls={panel?.id}
      aria-haspopup="dialog"
      data-tooltip-dismissed={tooltipDismissed}
      onBlur={() => setTooltipDismissed(false)}
      onMouseEnter={() => setTooltipDismissed(false)}
      onPointerEnter={onIntent}
      onPointerDown={onIntent}
      onFocus={onIntent}
      onClick={() => onOpenChange(!open)}
    >
      <MessageCircle size={20} aria-hidden="true" />
      <span>Ask</span>
    </button>
  )
}
