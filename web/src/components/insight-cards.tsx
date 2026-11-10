import type { CSSProperties, ReactNode } from "react"
import { categoryHue, formHue, formInk } from "@/lib/palette"

export function EstimateCard({
  form,
  title,
  note,
  children,
}: {
  form: string
  title: ReactNode
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="panel estimate"
      style={{ "--hue": formHue(form), color: formInk(form) } as CSSProperties}
    >
      <div>
        <h2>{title}</h2>
        {note}
      </div>
      <div>{children}</div>
    </section>
  )
}

export function BigNumber({ children }: { children: ReactNode }) {
  return <div className="big-number">{children}</div>
}

export function BulletinCutoffCard({
  category,
  title,
  children,
}: {
  category: string
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="panel bulletin-card"
      style={{ background: categoryHue(category) }}
    >
      <h2>{title}</h2>
      {children}
    </section>
  )
}
