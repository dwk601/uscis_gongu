import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { caseQuery, type CaseResponse } from "@/lib/case"
import { formLabel } from "@/lib/labels"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState, type FormEvent } from "react"
import { useAuth, mutationErrorMessage } from "@/lib/auth"
import { validForm, listPosts } from "@/lib/community"
import { pb } from "@/lib/pb"
import { PostCard } from "@/components/social-post"

export const Route = createFileRoute("/community/")({
  validateSearch: (
    s: Record<string, unknown>
  ): { sort: "new" | "top"; form: string; compose?: boolean } => ({
    sort: s.sort === "top" ? "top" : "new",
    form: validForm(s.form) ? s.form : "",
    compose: s.compose === true || s.compose === "true" ? true : undefined,
  }),
  component: Community,
})
function Community() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: "/community/" })
  const user = useAuth()
  const formNames = useQuery({
    ...caseQuery(search.form || "I-485"),
    placeholderData: keepPreviousData,
  })
  const client = useQueryClient()
  const forms =
    formNames.data?.forms ??
    client
      .getQueriesData<CaseResponse>({ queryKey: ["uscis", "case"] })
      .find(([, value]) => value?.forms)?.[1]?.forms
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(!!search.compose)
  const [composerForm, setComposerForm] = useState(search.form)
  useEffect(() => {
    if (user && search.compose)
      void navigate({
        search: { ...search, compose: undefined },
        replace: true,
      })
  }, [user, search, navigate])
  const feed = useInfiniteQuery({
    queryKey: ["post_feed", search.sort, search.form],
    queryFn: ({ pageParam }) => listPosts(pageParam, search.sort, search.form),
    initialPageParam: 1,
    getNextPageParam: (page) =>
      page.items.length === 20 ? page.page + 1 : undefined,
  })
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    const form = e.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError("")
    try {
      await pb.collection("posts").create({
        title: data.get("title"),
        body: data.get("body"),
        form: data.get("form"),
        author: user.id,
      })
      form.reset()
      setComposing(false)
      await client.invalidateQueries({ queryKey: ["post_feed"] })
    } catch (err) {
      setError(await mutationErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="workspace social">
      <h1>Community</h1>
      <div className="social-feed-actions">
        {user ? (
          <button
            className="chip"
            aria-expanded={composing}
            onClick={() => {
              if (!composing) setComposerForm(search.form)
              setComposing(!composing)
            }}
          >
            {composing ? "Cancel" : "Share my timeline"}
          </button>
        ) : (
          <Link
            className="primary"
            to="/login"
            search={{
              redirect: `/community?sort=${search.sort}&form=${encodeURIComponent(search.form)}&compose=true`,
            }}
          >
            Share my timeline
          </Link>
        )}
      </div>
      {user && composing && (
        <form className="social-card social-form" onSubmit={submit}>
          <label>
            Title
            <input name="title" required maxLength={120} />
          </label>
          <label>
            Post (optional)
            <textarea name="body" maxLength={5000} />
          </label>
          <label>
            Form (optional)
            <select
              name="form"
              value={composerForm}
              onChange={(e) => setComposerForm(e.target.value)}
            >
              <option value="">No form</option>
              {composerForm && !forms?.some((f) => f.form === composerForm) && (
                <option value={composerForm}>{composerForm}</option>
              )}
              {forms?.map((f) => (
                <option key={f.form} value={f.form}>
                  {formLabel(f.form, forms)}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Posting…" : "Post"}
          </button>
        </form>
      )}
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      {search.form &&
        formNames.data &&
        !formNames.isPlaceholderData &&
        (() => {
          const { eligibleReports: count, years } = formNames.data.summary
          if (count == null) return null
          const first = Math.min(...years),
            last = Math.max(...years)
          return (
            <p className="social-summary">
              {count === 0
                ? `No VisaJourney timeline reports for ${search.form}`
                : `${count.toLocaleString()} VisaJourney timeline ${count === 1 ? "report" : "reports"} for ${search.form}`}
              {years.length > 0 &&
                ` · ${first === last ? first : `${first}–${last}`}`}
            </p>
          )
        })()}
      <div
        className="social-filters"
        role="group"
        aria-label="Sort and filter posts"
      >
        {(["new", "top"] as const).map((sort) => (
          <button
            key={sort}
            className="chip"
            aria-pressed={search.sort === sort}
            onClick={() => void navigate({ search: { ...search, sort } })}
          >
            {sort === "new" ? "New" : "Top"}
          </button>
        ))}
        <label>
          Form{" "}
          <select
            aria-label="Form"
            value={search.form}
            onChange={(e) =>
              void navigate({
                search: { ...search, form: e.target.value, compose: undefined },
              })
            }
          >
            <option value="">All forms</option>
            {search.form && !forms?.some((f) => f.form === search.form) && (
              <option value={search.form}>{search.form}</option>
            )}
            {forms?.map((f) => (
              <option key={f.form} value={f.form}>
                {formLabel(f.form, forms)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {feed.isLoading && <p>Loading posts…</p>}
      {feed.isError && (
        <p role="alert">Could not load posts. Please try again.</p>
      )}
      {feed.data?.pages
        .flatMap((p) => p.items)
        .map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      {feed.data && !feed.data.pages[0].items.length && <p>No posts yet.</p>}
      {feed.hasNextPage && (
        <button
          className="chip"
          disabled={feed.isFetchingNextPage}
          onClick={() => feed.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </main>
  )
}
