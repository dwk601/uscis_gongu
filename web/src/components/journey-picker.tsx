import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle"
import { journeys, type JourneyId } from "@/lib/journeys"

// Browsers do not scroll a partly visible focused button into view on their own.
function revealOnFocus(event: React.FocusEvent<HTMLButtonElement>) {
  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
}

export function JourneyPicker({
  value,
  onChange,
}: {
  value: JourneyId
  onChange: (id: JourneyId) => void
}) {
  return (
    <ToggleGroup
      className="journey-picker journey-picker--compact"
      aria-label="Journey"
      value={[value]}
      deselectable={false}
      onValueChange={([id]) => {
        if (id) onChange(id)
      }}
    >
      {journeys.map((journey) => (
        <Toggle
          className="chip"
          key={journey.id}
          value={journey.id}
          onFocus={revealOnFocus}
          onClick={() => {
            if (value === journey.id) onChange(journey.id)
          }}
        >
          <span>{journey.name}</span>
        </Toggle>
      ))}
      <Toggle
        className="chip"
        value="all"
        onFocus={revealOnFocus}
        onClick={() => {
          if (value === "all") onChange("all")
        }}
      >
        <span>All forms</span>
      </Toggle>
    </ToggleGroup>
  )
}
