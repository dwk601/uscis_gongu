import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { formsQuery } from "@/lib/api"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { useAuth, mutationErrorMessage } from "@/lib/auth"
import { forms, listPosts } from "@/lib/community"
import { pb } from "@/lib/pb"
import { PostCard, SignIn } from "@/components/social-post"

export const Route = createFileRoute("/community/")({
  validateSearch: (
    s: Record<string, unknown>
  ): { sort: "new" | "top"; form: string } => ({
    sort: s.sort === "top" ? "top" : "new",
    form: typeof s.form === "string" && forms.includes(s.form) ? s.form : "",
  }),
  component: Community,
})
function Community() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: "/community/" })
  const user = useAuth()
  const formNames = useQuery(formsQuery())
  const formLabel = (code: string) => {
    const name = formNames.data?.forms.find((f) => f.form === code)?.name
    return name ? `${name} · ${code}` : code
  }
  const client = useQueryClient()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const feed = useInfiniteQuery({
    queryKey: ["post_feed", search],
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
            onClick={() => setComposing(!composing)}
          >
            {composing ? "Cancel" : "New post"}
          </button>
        ) : (
          <SignIn action="post" />
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
            <select name="form">
              <option value="">No form</option>
              {forms.map((f) => (
                <option key={f} value={f}>
                  {formLabel(f)}
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
      <div
        className="chip-rail"
        role="group"
        aria-label="Sort and filter posts"
        tabIndex={0}
      >
        {(["new", "top"] as const).map((sort) => (
          <button
            key={sort}
            className="chip"
            aria-pressed={search.sort === sort}
            onClick={() => navigate({ search: { ...search, sort } })}
          >
            {sort === "new" ? "New" : "Top"}
          </button>
        ))}
        {["", ...forms].map((form) => (
          <button
            key={form}
            className="chip"
            aria-pressed={search.form === form}
            onClick={() => navigate({ search: { ...search, form } })}
          >
            {form ? formLabel(form) : "All"}
          </button>
        ))}
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
