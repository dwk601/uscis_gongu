import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <h1 className="flex items-center gap-3 text-4xl font-semibold tracking-tight">
        <img src="/gongu.svg" alt="" className="size-12" />
        gongu
      </h1>
    </main>
  )
}
