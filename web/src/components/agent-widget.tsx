import { Link, useRouterState } from "@tanstack/react-router"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import { MessageCircle, X } from "lucide-react"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { mutationErrorMessage, useAuth } from "@/lib/auth"
import { agentError, askAgent, type AgentResponse } from "@/lib/agent"
import { pb } from "@/lib/pb"
import { AgentAnswer } from "@/components/agent-answer"
import { Button } from "@/components/ui/button"
import "./agent.css"

function SignIn({
  redirect,
  ended = false,
}: {
  redirect: string
  ended?: boolean
}) {
  return (
    <div className="agent-signin">
      <p>
        {ended
          ? "Your session ended. Please sign in again."
          : "Sign in to ask about the USCIS data on gongu. Browsing is always open."}
      </p>
      <Link className="primary" to="/login" search={{ redirect }}>
        Sign in
      </Link>
    </div>
  )
}

type Exchange = { question: string; answer: AgentResponse | null }

type Budget = { remaining: number; resetsAt: string; limit?: number }

function BudgetStatus({ budget }: { budget: Budget | null }) {
  return (
    <p className="agent-budget">
      {budget ? (
        <>
          {budget.remaining.toLocaleString()}
          {budget.limit != null && ` / ${budget.limit.toLocaleString()}`} tokens
          remaining
          <br />
          Resets{" "}
          <time dateTime={budget.resetsAt}>
            {new Date(budget.resetsAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "UTC",
            })}{" "}
            UTC
          </time>
        </>
      ) : (
        "Your token budget and reset time appear after your first question."
      )}
    </p>
  )
}

function AgentSession({
  userId,
  onSessionEnded,
}: {
  userId: string
  onSessionEnded: (error: unknown) => Promise<void>
}) {
  const [question, setQuestion] = useState("")
  const [exchange, setExchange] = useState<Exchange | null>(null)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)
  const request = useRef<AbortController | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()
  const hintId = useId()
  const length = [...question.trim()].length
  const tooLong = length > 2000

  useEffect(() => () => request.current?.abort(), [])

  // A failed or canceled question returns to the textarea for a retry and the
  // previous exchange stays on screen.
  function restore(asked: string, previous: Exchange | null) {
    setQuestion((current) => current || asked)
    setExchange(previous)
  }

  function cancel() {
    request.current?.abort()
    request.current = null
    setPending(false)
    setStatus("Question canceled.")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!length || tooLong || request.current) return
    const controller = new AbortController()
    const asked = question.trim()
    const previous = exchange
    request.current = controller
    controller.signal.addEventListener("abort", () => restore(asked, previous))
    setPending(true)
    setError("")
    setStatus("Asking gongu…")
    setQuestion("")
    setExchange({ question: asked, answer: null })
    content.current?.scrollTo({ top: 0 })
    const isCurrent = () =>
      !controller.signal.aborted &&
      request.current === controller &&
      pb.authStore.record?.id === userId
    try {
      const response = await askAgent(asked, controller.signal, (message) => {
        if (isCurrent()) setStatus(message)
      })
      if (!isCurrent()) return
      setExchange({ question: asked, answer: response })
      setBudget(response.budget)
      setStatus("Answer ready.")
      content.current?.scrollTo({ top: 0 })
      // Ask is disabled with an empty textarea; keep focus ready for a follow-up.
      input.current?.focus()
    } catch (err) {
      if (!isCurrent()) return
      const failure = agentError(err)
      if (failure.sessionEnded) {
        await onSessionEnded(err)
        return
      }
      restore(asked, previous)
      setError(failure.message)
      if (failure.budget) setBudget(failure.budget)
      setStatus("")
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
      }
    }
  }

  return (
    <>
      <div className="agent-content" ref={content} aria-busy={pending}>
        {exchange ? (
          <>
            <p className="agent-question">{exchange.question}</p>
            {exchange.answer ? (
              <AgentAnswer answer={exchange.answer} />
            ) : (
              <p className="agent-thinking" aria-hidden="true">
                <span className="agent-dots" />
                {status}
              </p>
            )}
          </>
        ) : (
          <p className="agent-intro">
            What would you like to know about case waits, trends, or the visa
            bulletin?
          </p>
        )}
      </div>
      <form className="agent-form" onSubmit={submit}>
        <p
          className={pending ? "sr-only" : "agent-status"}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
        {error && (
          <p className="error agent-error" role="alert">
            {error}
          </p>
        )}
        <label htmlFor={inputId}>Your question</label>
        <textarea
          ref={input}
          id={inputId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={2}
          placeholder="How long does I-485 usually take?"
          aria-describedby={tooLong ? hintId : undefined}
          aria-invalid={tooLong || undefined}
          readOnly={pending}
        />
        {tooLong && (
          <p id={hintId} className="agent-status">
            Keep your question to 2,000 characters.
          </p>
        )}
        <div className="agent-submit-row">
          <BudgetStatus budget={budget} />
          <Button
            className={pending ? "chip" : "primary"}
            type="submit"
            disabled={!pending && (!length || tooLong)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.repeat) event.preventDefault()
            }}
            onClick={(event) => {
              if (request.current) {
                event.preventDefault()
                cancel()
              }
            }}
          >
            {pending ? "Cancel" : "Ask"}
          </Button>
        </div>
      </form>
    </>
  )
}

export function AgentWidget({
  launcherTarget,
  open,
  onOpenChange,
  onOpening,
}: {
  launcherTarget: HTMLElement | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpening: () => void
}) {
  const user = useAuth()
  const location = useRouterState({ select: (state) => state.location })
  const redirect = location.pathname + location.searchStr
  const [tooltipDismissed, setTooltipDismissed] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()

  async function endSession(error: unknown) {
    setSessionEnded(true)
    // Revalidate shared auth; the widget owns the session-ended notice.
    await mutationErrorMessage(error)
  }

  useEffect(
    () =>
      pb.authStore.onChange(() => {
        if (pb.authStore.isValid) setSessionEnded(false)
      }),
    []
  )

  useEffect(() => {
    function dismissTooltip(event: KeyboardEvent) {
      const button = launcher.current
      if (
        event.key === "Escape" &&
        (button?.matches(":focus-visible") ||
          (window.matchMedia("(hover: hover)").matches &&
            button?.parentElement?.matches(":hover")))
      )
        setTooltipDismissed(true)
    }
    document.addEventListener("keydown", dismissTooltip)
    return () => document.removeEventListener("keydown", dismissTooltip)
  }, [])

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>("textarea, a")?.focus()
  }, [open, sessionEnded])

  useEffect(() => {
    if (!open) return
    function escape(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        !panel.current?.contains(event.target as Node)
      ) {
        event.preventDefault()
        setTooltipDismissed(true)
        onOpenChange(false)
        launcher.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener("keydown", escape)
    return () => document.removeEventListener("keydown", escape)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const mobile = window.matchMedia("(max-width: 640px), (max-height: 520px)")
    const previousOverflow = document.body.style.overflow
    function lock() {
      document.body.style.overflow = mobile.matches
        ? "hidden"
        : previousOverflow
    }
    lock()
    mobile.addEventListener("change", lock)
    return () => {
      document.body.style.overflow = previousOverflow
      mobile.removeEventListener("change", lock)
    }
  }, [open])

  return (
    <div className="agent-widget">
      <Dialog
        open={open}
        modal={false}
        onOpenChange={(next, details) => {
          if (next) onOpening()
          if (details.reason === "escape-key") setTooltipDismissed(true)
          onOpenChange(next)
        }}
      >
        <DialogContent
          ref={panel}
          id={panelId}
          className="agent-panel"
          render={<section />}
          keepMounted
          initialFocus="textarea, a"
        >
          <header className="agent-header">
            <DialogTitle>Ask gongu</DialogTitle>
            <DialogClose
              render={
                <Button
                  className="chip agent-icon"
                  type="button"
                  aria-label="Close Ask gongu"
                />
              }
            >
              <X size={20} aria-hidden="true" />
            </DialogClose>
          </header>
          {user && !sessionEnded ? (
            <AgentSession
              key={user.id}
              userId={user.id}
              onSessionEnded={endSession}
            />
          ) : (
            <SignIn redirect={redirect} ended={sessionEnded} />
          )}
        </DialogContent>
        {launcherTarget &&
          createPortal(
            <DialogTrigger
              ref={launcher}
              render={<Button className="chip agent-launcher" type="button" />}
              aria-label="Ask gongu"
              aria-expanded={open}
              aria-controls={panelId}
              data-tooltip-dismissed={tooltipDismissed}
              onBlur={() => setTooltipDismissed(false)}
              onMouseEnter={() => setTooltipDismissed(false)}
            >
              <MessageCircle size={20} aria-hidden="true" />
              <span>Ask</span>
            </DialogTrigger>,
            launcherTarget
          )}
      </Dialog>
    </div>
  )
}
