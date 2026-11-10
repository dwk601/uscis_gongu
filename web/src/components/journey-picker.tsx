import { journeys, type JourneyId } from "@/lib/journeys"

// Browsers do not scroll a partly visible focused button into view on their own.
function revealOnFocus(event: React.FocusEvent<HTMLButtonElement>) {
  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
}

export function JourneyPicker({
  value,
  onChange,
  variant,
}: {
  value: JourneyId
  onChange: (id: JourneyId) => void
  variant: "compact"
}) {
  return (
    <div
      className={`journey-picker journey-picker--${variant}`}
      role="group"
      aria-label="Journey"
    >
      {journeys.map((journey) => (
        <button
          type="button"
          className="chip"
          key={journey.id}
          aria-pressed={value === journey.id}
          onFocus={revealOnFocus}
          onClick={() => onChange(journey.id)}
        >
          <span>{journey.name}</span>
        </button>
      ))}
      <button
        type="button"
        className="chip"
        aria-pressed={value === "all"}
        onFocus={revealOnFocus}
        onClick={() => onChange("all")}
      >
        <span>All forms</span>
      </button>
    </div>
  )
}
