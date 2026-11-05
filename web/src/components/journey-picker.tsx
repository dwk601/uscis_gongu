import { journeys, type JourneyId } from "@/lib/journeys"

export function JourneyPicker({
  value,
  onChange,
  variant,
}: {
  value: JourneyId
  onChange: (id: JourneyId) => void
  variant: "cards" | "compact"
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
          key={journey.id}
          aria-pressed={value === journey.id}
          onClick={() => onChange(journey.id)}
        >
          <span>{journey.name}</span>
          {variant === "cards" && <small>{journey.descriptor}</small>}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        <span>All forms</span>
        {variant === "cards" && <small>Explore every available form</small>}
      </button>
    </div>
  )
}
