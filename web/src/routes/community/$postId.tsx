import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { PostCard, SignIn } from "@/components/social-post"
import { isAdmin, useAuth, mutationErrorMessage } from "@/lib/auth"
import {
  relativeTime,
  validForm,
  type Post,
  type Comment,
} from "@/lib/community"
import { pb } from "@/lib/pb"

export const Route = createFileRoute("/community/$postId")({
  validateSearch: (
    s: Record<string, unknown>
  ): { form: string; sort: "new" | "top" } => ({
    form: validForm(s.form) ? s.form : "",
    sort: s.sort === "top" ? "top" : "new",
  }),
  component: Detail,
})
function Detail() {
  const { postId } = Route.useParams()
  const { form: selectedForm, sort } = Route.useSearch()
  const user = useAuth()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const post = useQuery({
    queryKey: ["post_feed", postId],
    queryFn: () => pb.collection("post_feed").getOne<Post>(postId),
    retry: (count, error) =>
      (error as { status?: number }).status !== 404 && count < 3,
  })
  const comments = useQuery({
    queryKey: ["comment_feed", postId],
    queryFn: () =>
      pb.collection("comment_feed").getFullList<Comment>({
        filter: pb.filter("post = {:post}", { post: postId }),
        sort: "created",
      }),
  })
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["post_feed"] }),
      client.invalidateQueries({ queryKey: ["comment_feed"] }),
    ])
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    const form = e.currentTarget
    setBusy(true)
    setError("")
    try {
      await pb.collection("comments").create({
        post: postId,
        author: user.id,
        body: new FormData(form).get("body"),
      })
      form.reset()
      await refresh()
    } catch (err) {
      setError(await mutationErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  async function remove(collection: "posts" | "comments", id: string) {
    if (
      !window.confirm(
        collection === "posts"
          ? "Delete this post? Its comments and votes will also be deleted."
          : "Delete this comment?"
      )
    )
      return
    setBusy(true)
    setError("")
    try {
      await pb.collection(collection).delete(id)
      if (collection === "posts") {
        await navigate({
          to: "/community",
          search: { sort, form: selectedForm },
        })
      }
      await refresh()
    } catch (err) {
      setError(await mutationErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="workspace social">
      <Link
        className="social-back"
        to="/community"
        search={{ sort, form: selectedForm }}
      >
        Back to community
      </Link>
      <h1>{post.data?.title ?? "Community post"}</h1>
      {post.isLoading && <p>Loading post…</p>}
      {post.isError && <p role="alert">This post could not be found.</p>}
      {post.data && (
        <>
          <PostCard post={post.data} detail />
          {(user?.id === post.data.author || isAdmin(user)) && (
            <button
              className="chip danger"
              disabled={busy}
              onClick={() => remove("posts", postId)}
            >
              Delete post
            </button>
          )}
          <h2>Comments</h2>
          {comments.isLoading && <p>Loading comments…</p>}
          {comments.isError && <p role="alert">Could not load comments.</p>}
          {comments.data?.map((c) => (
            <article className="social-card" key={c.id}>
              <div className="social-meta">
                <span>{c.author_name || "member"}</span>
                <span>{relativeTime(c.created)}</span>
              </div>
              <p className="social-body">{c.body}</p>
              {(user?.id === c.author || isAdmin(user)) && (
                <button
                  className="chip danger"
                  disabled={busy}
                  onClick={() => remove("comments", c.id)}
                >
                  Delete comment
                </button>
              )}
            </article>
          ))}
          {comments.data?.length === 0 && <p>No comments yet.</p>}
          {user ? (
            <form className="social-card social-form" onSubmit={submit}>
              <label>
                Comment
                <textarea name="body" required maxLength={2000} />
              </label>
              <button className="primary" disabled={busy}>
                Comment
              </button>
            </form>
          ) : (
            <div className="social-actions">
              <SignIn action="comment" />
            </div>
          )}
        </>
      )}
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
