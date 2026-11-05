import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useRouterState } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowUp } from "lucide-react"
import { useAuth, mutationErrorMessage } from "@/lib/auth"
import { listVotes, relativeTime, type Post } from "@/lib/community"
import { formHue, formInk } from "@/lib/palette"
import { pb } from "@/lib/pb"

export function SignIn({ action }: { action: string }) {
  const location = useRouterState({ select: (s) => s.location.href })
  return (
    <Link className="primary" to="/login" search={{ redirect: location }}>
      Sign in to {action}
    </Link>
  )
}
export function PostCard({
  post,
  detail = false,
}: {
  post: Post
  detail?: boolean
}) {
  const user = useAuth()
  const client = useQueryClient()
  const [error, setError] = useState("")
  const [optimistic, setOptimistic] = useState<{
    voted: boolean
    count: number
  } | null>(null)
  const votes = useQuery({
    queryKey: ["votes", user?.id],
    queryFn: listVotes,
    enabled: !!user,
  })
  const vote = votes.data?.find((v) => v.post === post.id)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!user || !votes.data) throw new Error("Vote state unavailable")
      if (vote) await pb.collection("votes").delete(vote.id)
      else await pb.collection("votes").create({ post: post.id, user: user.id })
    },
    onMutate: async () => {
      setError("")
      setOptimistic({ voted: !vote, count: post.votes + (vote ? -1 : 1) })
    },
    onError: async (e) => {
      setOptimistic(null)
      setError(await mutationErrorMessage(e))
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["votes"] }),
        client.invalidateQueries({ queryKey: ["post_feed"] }),
      ])
      setOptimistic(null)
    },
  })
  const location = useRouterState({ select: (s) => s.location.href })
  const voted = optimistic?.voted ?? !!vote
  const count = optimistic?.count ?? post.votes
  return (
    <article className="social-card">
      <div className="social-meta">
        {post.form && (
          <span
            className="social-tag"
            style={{
              background: formHue(post.form),
              color: formInk(post.form),
            }}
          >
            {post.form}
          </span>
        )}
        <span>{post.author_name || "member"}</span>
        <span>{relativeTime(post.created)}</span>
      </div>
      <h2>
        {detail ? (
          post.title
        ) : (
          <Link to="/community/$postId" params={{ postId: post.id }}>
            {post.title}
          </Link>
        )}
      </h2>
      {post.body && (
        <p className={detail ? "social-body" : "social-preview"}>{post.body}</p>
      )}
      <div className="social-actions">
        {user ? (
          <button
            className="chip"
            aria-label={`${voted ? "Remove upvote" : "Upvote"}, ${count} ${count === 1 ? "vote" : "votes"}`}
            aria-pressed={voted}
            disabled={mutation.isPending || votes.isLoading || votes.isError}
            onClick={() => mutation.mutate()}
            type="button"
          >
            <ArrowUp aria-hidden="true" size={16} /> {count}
          </button>
        ) : (
          <Link
            className="chip"
            to="/login"
            search={{ redirect: location }}
            aria-label={`Sign in to upvote, ${post.votes} ${post.votes === 1 ? "vote" : "votes"}`}
          >
            <ArrowUp aria-hidden="true" size={16} /> {post.votes}
          </Link>
        )}
        <Link to="/community/$postId" params={{ postId: post.id }}>
          {post.comments} {post.comments === 1 ? "comment" : "comments"}
        </Link>
      </div>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}
