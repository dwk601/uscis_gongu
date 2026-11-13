import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle"
import type { RecordModel } from "pocketbase"
import { mutationErrorMessage } from "@/lib/auth"
import { relativeTime, type Comment, type Post } from "@/lib/community"
import { pb } from "@/lib/pb"

interface Member extends RecordModel {
  name: string
  created: string
}

function Pagination({
  page,
  totalPages,
  busy,
  label,
  onChange,
}: {
  page: number
  totalPages: number
  busy: boolean
  label: string
  onChange: (page: number) => void
}) {
  if (totalPages <= 1 && page === 1) return null
  return (
    <nav className="controls" aria-label={label}>
      <button
        className="chip"
        disabled={busy || page === 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        className="chip"
        disabled={busy || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  )
}

export function AdminCommunity({ userId }: { userId: string }) {
  const [page, setPage] = useState(1)
  const [member, setMember] = useState<Member | null>(null)
  const members = useQuery({
    queryKey: ["admin", userId, "users", page],
    queryFn: () =>
      pb.collection("users").getList<Member>(page, 20, {
        sort: "-created,-id",
      }),
  })
  return (
    <section className="social-section" aria-labelledby="admin-heading">
      <h2 id="admin-heading">Community admin</h2>
      <p>Select a member to review their posts and comments.</p>
      <h3>Members</h3>
      {members.isLoading && <p role="status">Loading members…</p>}
      {members.isError && (
        <p className="social-error" role="alert">
          Could not load members.{" "}
          <button className="chip" onClick={() => void members.refetch()}>
            Try again
          </button>
        </p>
      )}
      {members.data?.items.length === 0 && <p>No members on this page.</p>}
      {!!members.data?.items.length && (
        <ToggleGroup
          aria-label="Members"
          orientation="vertical"
          value={member ? [member.id] : []}
          deselectable={false}
          onValueChange={([id]) => {
            const selected = members.data?.items.find((item) => item.id === id)
            if (selected) setMember(selected)
          }}
        >
          {members.data?.items.map((item) => (
            <article className="social-card" key={item.id}>
              <Toggle
                className="chip social-body"
                value={item.id}
                onClick={() => {
                  if (member?.id === item.id) setMember(item)
                }}
              >
                {item.name || "member"}
              </Toggle>
              <p className="social-meta">
                <span>{item.id}</span>
                <span>
                  Joined{" "}
                  <time dateTime={item.created.replace(" ", "T")}>
                    {new Date(
                      item.created.replace(" ", "T")
                    ).toLocaleDateString()}
                  </time>
                </span>
              </p>
            </article>
          ))}
        </ToggleGroup>
      )}
      <Pagination
        page={page}
        totalPages={members.data?.totalPages ?? page}
        busy={members.isFetching}
        label="Member pages"
        onChange={setPage}
      />
      {member && (
        <MemberContent key={member.id} userId={userId} member={member} />
      )}
    </section>
  )
}

function MemberContent({ userId, member }: { userId: string; member: Member }) {
  const client = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const [postPage, setPostPage] = useState(1)
  const [commentPage, setCommentPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const posts = useQuery({
    queryKey: ["post_feed", "admin", userId, member.id, postPage],
    queryFn: () =>
      pb.collection("post_feed").getList<Post>(postPage, 20, {
        filter: pb.filter("author = {:author}", { author: member.id }),
        sort: "-created,-id",
      }),
  })
  const comments = useQuery({
    queryKey: ["comment_feed", "admin", userId, member.id, commentPage],
    queryFn: () =>
      pb.collection("comment_feed").getList<Comment>(commentPage, 20, {
        filter: pb.filter("author = {:author}", { author: member.id }),
        sort: "-created,-id",
      }),
  })
  async function remove(collection: "posts" | "comments", id: string) {
    if (
      busy ||
      !window.confirm(
        collection === "posts"
          ? "Delete this post? Its comments and votes will also be deleted."
          : "Delete this comment?"
      )
    )
      return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await pb.collection(collection).delete(id)
      await Promise.all([
        client.invalidateQueries({ queryKey: ["post_feed"] }),
        client.invalidateQueries({ queryKey: ["comment_feed"] }),
      ])
      setMessage(collection === "posts" ? "Post deleted." : "Comment deleted.")
    } catch (err) {
      setError(await mutationErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="social-section" aria-label="Selected member content">
      <h3 className="social-body" ref={heading} tabIndex={-1}>
        Content by {member.name || "member"}
      </h3>
      <p className="social-body">{member.id}</p>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <h4>Posts</h4>
      {posts.isLoading && <p role="status">Loading posts…</p>}
      {posts.isError && (
        <p className="social-error" role="alert">
          Could not load posts.{" "}
          <button className="chip" onClick={() => void posts.refetch()}>
            Try again
          </button>
        </p>
      )}
      {posts.data?.items.length === 0 && <p>No posts on this page.</p>}
      {posts.data?.items.map((post) => (
        <article className="social-card" key={post.id}>
          <h4>
            <Link
              to="/community/$postId"
              params={{ postId: post.id }}
              search={{ sort: "new", form: "" }}
            >
              {post.title}
            </Link>
          </h4>
          <p className="social-meta">{relativeTime(post.created)}</p>
          <p className="social-body">{post.body}</p>
          <button
            className="chip danger"
            disabled={busy}
            onClick={() => void remove("posts", post.id)}
          >
            Delete post
          </button>
        </article>
      ))}
      <Pagination
        page={postPage}
        totalPages={posts.data?.totalPages ?? postPage}
        busy={busy || posts.isFetching}
        label="Member post pages"
        onChange={setPostPage}
      />
      <h4>Comments</h4>
      {comments.isLoading && <p role="status">Loading comments…</p>}
      {comments.isError && (
        <p className="social-error" role="alert">
          Could not load comments.{" "}
          <button className="chip" onClick={() => void comments.refetch()}>
            Try again
          </button>
        </p>
      )}
      {comments.data?.items.length === 0 && <p>No comments on this page.</p>}
      {comments.data?.items.map((comment) => (
        <article className="social-card" key={comment.id}>
          <p className="social-meta">{relativeTime(comment.created)}</p>
          <p className="social-body">{comment.body}</p>
          <div className="social-actions">
            <Link
              to="/community/$postId"
              params={{ postId: comment.post }}
              search={{ sort: "new", form: "" }}
            >
              View post
            </Link>
            <button
              className="chip danger"
              disabled={busy}
              onClick={() => void remove("comments", comment.id)}
            >
              Delete comment
            </button>
          </div>
        </article>
      ))}
      <Pagination
        page={commentPage}
        totalPages={comments.data?.totalPages ?? commentPage}
        busy={busy || comments.isFetching}
        label="Member comment pages"
        onChange={setCommentPage}
      />
    </section>
  )
}
