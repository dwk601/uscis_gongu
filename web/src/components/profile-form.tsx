import { useState, type FormEvent } from "react"
import type { RecordModel } from "pocketbase"
import { Button } from "@ui-sdk/react/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@ui-sdk/react/combobox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"
import { mutationErrorMessage } from "@/lib/auth"
import { pb } from "@/lib/pb"
import {
  countryOptions,
  profileAnswers,
  seekingOptions,
  statusOptions,
  type ProfileAnswers,
} from "@/lib/profile"

const seekingLabel = (value: string) =>
  seekingOptions.find((option) => option.value === value)?.label ?? value
const countryLabel = (value: string) =>
  countryOptions.find((option) => option.value === value)?.label ?? value

type FieldErrors = Partial<Record<keyof ProfileAnswers, string>>

export function ProfileForm({
  user,
  submitLabel = "Save answers",
  onSaved,
}: {
  user: RecordModel
  submitLabel?: string
  onSaved?: () => void | Promise<void>
}) {
  const [answers, setAnswers] = useState(() => profileAnswers(user))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [seekingAnchor, setSeekingAnchor] = useState<HTMLDivElement | null>(
    null
  )
  const [countryAnchor, setCountryAnchor] = useState<HTMLDivElement | null>(
    null
  )

  function change<K extends keyof ProfileAnswers>(
    key: K,
    value: ProfileAnswers[K]
  ) {
    setAnswers((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setSaved(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    setSaved(false)
    setFieldErrors({})
    try {
      const token = pb.authStore.token
      const record = await pb.collection("users").update(user.id, {
        seeking: answers.seeking,
        status: answers.status,
        country: answers.country,
      })
      if (pb.authStore.token !== token) return
      pb.authStore.save(token, record)
      setSaved(true)
      await onSaved?.()
    } catch (error) {
      const data = (
        error as {
          response?: { data?: Record<string, { message?: string }> }
        }
      ).response?.data
      setFieldErrors({
        seeking: data?.seeking?.message,
        status: data?.status?.message,
        country: data?.country?.message,
      })
      setError(
        `Couldn’t save your answers. ${await mutationErrorMessage(error)}`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="profile-form" onSubmit={submit} aria-busy={busy}>
      <p className="profile-privacy">Private. Never shown on your posts.</p>
      <Field name="seeking" invalid={fieldErrors.seeking ? true : undefined}>
        <FieldLabel>What cases are you looking for?</FieldLabel>
        <Combobox
          multiple
          required
          readOnly={busy}
          value={answers.seeking}
          itemToLabel={seekingLabel}
          onValueChange={(next) => {
            const addedNone =
              next.includes("none") && !answers.seeking.includes("none")
            change(
              "seeking",
              addedNone ? ["none"] : next.filter((value) => value !== "none")
            )
          }}
        >
          <div className="profile-combo" ref={setSeekingAnchor}>
            <ComboboxChips>
              <ComboboxValue>
                {(state) =>
                  (state.value as string[]).map((value) => (
                    <ComboboxChip key={value} value={value}>
                      {value === "none" ? seekingLabel(value) : value}
                      <ComboboxChipRemove
                        aria-label={`Remove ${seekingLabel(value)}`}
                      >
                        <XIcon aria-hidden="true" />
                      </ComboboxChipRemove>
                    </ComboboxChip>
                  ))
                }
              </ComboboxValue>
              <ComboboxInput placeholder="Search forms…" />
            </ComboboxChips>
            <ComboboxTrigger aria-label="Show case options">
              <ChevronDownIcon aria-hidden="true" />
            </ComboboxTrigger>
          </div>
          <ComboboxContent
            className="profile-popup"
            sideOffset={6}
            anchor={seekingAnchor}
          >
            <ComboboxEmpty>No forms found.</ComboboxEmpty>
            <ComboboxList>
              {seekingOptions.map((option) => (
                <ComboboxItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                >
                  {option.label}
                  <ComboboxItemIndicator>
                    <CheckIcon aria-hidden="true" />
                  </ComboboxItemIndicator>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          Choose any that apply, or Nothing right now (N/A).
        </FieldDescription>
        <FieldError match="valueMissing">Choose a case or N/A.</FieldError>
        {fieldErrors.seeking && (
          <FieldError match>{fieldErrors.seeking}</FieldError>
        )}
      </Field>
      <Field name="status" invalid={fieldErrors.status ? true : undefined}>
        <FieldLabel>Current immigration status</FieldLabel>
        <Select
          required
          readOnly={busy}
          items={statusOptions}
          value={answers.status || null}
          onValueChange={(next) => change("status", next ?? "")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose your status" />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent className="profile-popup" sideOffset={6}>
            {statusOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                label={option.label}
              >
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError match="valueMissing">Choose a status or N/A.</FieldError>
        {fieldErrors.status && (
          <FieldError match>{fieldErrors.status}</FieldError>
        )}
      </Field>
      <Field name="country" invalid={fieldErrors.country ? true : undefined}>
        <FieldLabel>Country or region you are from</FieldLabel>
        <Combobox
          required
          readOnly={busy}
          value={answers.country || null}
          itemToLabel={countryLabel}
          onValueChange={(next) => change("country", next ?? "")}
        >
          <div className="profile-combo" ref={setCountryAnchor}>
            <ComboboxInput placeholder="Search countries or regions…" />
            <ComboboxTrigger aria-label="Show countries and regions">
              <ChevronDownIcon aria-hidden="true" />
            </ComboboxTrigger>
          </div>
          <ComboboxContent
            className="profile-popup"
            sideOffset={6}
            anchor={countryAnchor}
          >
            <ComboboxEmpty>No countries or regions found.</ComboboxEmpty>
            <ComboboxList>
              {countryOptions.map((option) => (
                <ComboboxItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                >
                  {option.label}
                  <ComboboxItemIndicator>
                    <CheckIcon aria-hidden="true" />
                  </ComboboxItemIndicator>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldError match="valueMissing">
          Choose a country or region, or N/A.
        </FieldError>
        {fieldErrors.country && (
          <FieldError match>{fieldErrors.country}</FieldError>
        )}
      </Field>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="primary"
        disabled={busy}
        focusableWhenDisabled
      >
        {busy ? "Saving…" : submitLabel}
      </Button>
      {saved && <p role="status">Your answers are saved.</p>}
    </form>
  )
}
