import { useId, useRef, useState } from "react"
import type { FormSummary } from "@/lib/api"
import { formHue, formInk } from "@/lib/palette"

const groups: [string, string[]][] = [
  ["Green cards", ["I-485", "I-140", "I-526", "I-90", "I-751"]],
  ["Family", ["I-130", "I-129F"]],
  ["Work & staying in the U.S.", ["I-765", "I-129", "I-539", "I-821D"]],
  ["Citizenship", ["N-400"]],
  ["Travel", ["I-131"]],
  ["Other situations", ["I-360", "I-601A"]],
]
export function FormPicker({
  forms,
  value,
  onChange,
  label,
  emptyLabel,
  initiallyOpen = false,
  caption,
  unavailable = false,
  onRetry,
  inline = false,
}: {
  forms?: FormSummary[]
  value: string
  onChange: (value: string) => void
  label: string
  emptyLabel?: string
  initiallyOpen?: boolean
  caption?: string
  unavailable?: boolean
  onRetry?: () => void
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [otherState, setOtherState] = useState<{
    value: string
    open: boolean
  }>()
  const [filter, setFilter] = useState("")
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setOtherState(undefined)
    setFilter("")
  }
  const expanded = inline || initiallyOpen || open
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const summary = useRef<HTMLButtonElement>(null)
  const selected = forms?.find((f) => f.form === value)
  const other =
    otherState?.value === value
      ? otherState.open
      : inline && !!selected && !selected.featured
  const setOther = (open: boolean) => setOtherState({ value, open })
  const featured = forms?.filter((f) => f.featured) ?? []
  const others = forms?.filter((f) => !f.featured) ?? []
  const mapped = groups.flatMap(([, codes]) => codes)
  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => summary.current?.focus())
  }
  const show = () => {
    setFilter("")
    setOther(!!selected && !selected.featured)
    setOpen(true)
    requestAnimationFrame(() => {
      if (selected && !selected.featured) {
        const target = root.current?.querySelector<HTMLButtonElement>(
          '.form-other .form-choice[aria-pressed="true"]'
        )
        target?.focus({ preventScroll: true })
        target?.scrollIntoView({ block: "nearest" })
        return
      }
      const target =
        root.current?.querySelector<HTMLButtonElement>(
          '[aria-pressed="true"]'
        ) ?? root.current?.querySelector<HTMLButtonElement>(".form-choice")
      ;(
        target ??
        root.current?.querySelector<HTMLElement>(".form-picker-heading")
      )?.focus()
    })
  }
  const choose = (form: string) => {
    if (form !== value) onChange(form)
    if (!inline) close()
  }
  const choice = (f: FormSummary) => (
    <button
      type="button"
      className="form-choice"
      key={f.form}
      aria-pressed={value === f.form}
      onClick={() => choose(f.form)}
      style={{ background: formHue(f.form), color: formInk(f.form) }}
    >
      <span>{f.name}</span>
      <small>
        {f.form}
        {value === f.form ? " · Selected" : ""}
      </small>
    </button>
  )
  const matches = (filter.trim() ? (forms ?? []) : others).filter((f) =>
    `${f.form} ${f.name}`.toLowerCase().includes(filter.toLowerCase().trim())
  )
  return (
    <div
      className={inline ? "form-picker form-picker-inline" : "form-picker"}
      ref={root}
      role="group"
      aria-label={label}
      onKeyDown={(e) => {
        if (!inline && e.key === "Escape" && open) {
          e.preventDefault()
          close()
        }
      }}
    >
      {caption && <div className="form-picker-caption">{caption}</div>}
      {!initiallyOpen && !inline && (
        <button
          ref={summary}
          type="button"
          className="form-summary"
          aria-expanded={expanded}
          onClick={() => (open ? close() : show())}
        >
          <span>
            {selected ? selected.name : value || emptyLabel || "Choose a form"}
            {selected && <small>{value}</small>}
          </span>
          <span>{open ? "Close" : "Change form"}</span>
        </button>
      )}
      {expanded && (
        <div className="form-picker-options">
          {!initiallyOpen && (
            <h2 className="form-picker-heading" tabIndex={-1}>
              {label}
            </h2>
          )}
          {emptyLabel && (
            <button
              type="button"
              className="form-choice form-choice-empty"
              aria-pressed={!value}
              onClick={() => choose("")}
            >
              {emptyLabel}
              {!value && " · Selected"}
            </button>
          )}
          {!forms && (
            <p role="status">
              {unavailable
                ? "Forms are unavailable right now."
                : "Loading forms…"}{" "}
              {unavailable && onRetry && (
                <button type="button" onClick={onRetry}>
                  Try again
                </button>
              )}
            </p>
          )}
          {inline ? (
            <div className="form-choices form-inline-featured">
              {featured.map(choice)}
            </div>
          ) : (
            groups.map(([heading, codes]) => {
              const items = featured.filter(
                (f) =>
                  codes.includes(f.form) ||
                  (heading === "Other situations" && !mapped.includes(f.form))
              )
              return items.length ? (
                <section key={heading}>
                  <h3>{heading}</h3>
                  <div className="form-choices">{items.map(choice)}</div>
                </section>
              ) : null
            })
          )}
          {others.length > 0 && (
            <div className="form-other">
              {others.length > 0 && (
                <button
                  type="button"
                  className="form-other-toggle"
                  aria-expanded={other}
                  onClick={() => setOther(!other)}
                >
                  Don't see yours? Browse all other forms ({others.length})
                </button>
              )}
              {other && (
                <div className="form-other-options">
                  <label htmlFor={id}>Search by name or form number</label>
                  <input
                    id={id}
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault()
                    }}
                  />
                  {filter && (
                    <button
                      className="form-clear"
                      type="button"
                      onClick={() => setFilter("")}
                    >
                      Clear search
                    </button>
                  )}
                  <div className="form-choices">{matches.map(choice)}</div>
                  {!matches.length && (
                    <p>No forms found. Try another name or form number.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
